const throttle = require('lodash/throttle');
const axios = require('axios');
const { getResponseSender, Constants, CacheKeys, Time } = require('librechat-data-provider');
const { createAbortController, handleAbortError } = require('~/server/middleware');
const { sendMessage, createOnProgress } = require('~/server/utils');
const { getLogStores } = require('~/cache');
const { saveMessage } = require('~/models');
const { logger } = require('~/config');

/**
 * Parse categories from llama-guard response
 */
function parseOllamaResponse(response) {
  try {
    // Clean the response
    const cleanResponse = response.replace(/```json\n|\n```/g, '').trim();

    try {
      // Try parsing as JSON array first
      if (cleanResponse.startsWith('[') && cleanResponse.endsWith(']')) {
        return JSON.parse(cleanResponse);
      }
    } catch (jsonError) {
      logger.debug('[Moderation] JSON parse failed, trying line-based parsing:', jsonError.message);
    }

    // Fall back to line-based parsing
    const lines = cleanResponse
      .split('\n')
      .map(line => line.trim().toLowerCase())
      .filter(line =>
        line.length > 0 &&
        !line.includes('no harmful content') &&
        !line.includes('analysis:') &&
        !line.includes('categories:'),
      );

    // If we only get "safe" indicators, return that
    if (lines.every(line => line.includes('safe'))) {
      return ['safe'];
    }

    // Filter out any obviously non-category lines
    return lines.filter(line =>
      !line.includes('the message') &&
      !line.includes('this content'),
    );
  } catch (error) {
    logger.error('[Moderation] Parse error:', error);
    return ['error'];
  }
}

/**
 * Handle message moderation using Ollama
 */
async function moderateMessage(message, req = null) {
  try {
    let contentToModerate = '';

    // Extract text content based on message structure
    if (message.text) {
      contentToModerate = message.text;
    } else if (Array.isArray(message.content)) {
      contentToModerate = message.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join(' ');
    }

    if (!contentToModerate) {
      return;
    }

    const ollamaRequest = {
      model: 'llama-guard3',
      messages: [{
        role: 'user',
        content: `Analyze the following message and return a JSON array of harmful content categories found, or "safe" if no harmful content is detected. Example: ["hate", "violence"] or ["safe"]. Message: "${contentToModerate}"`,
      }],
    };

    const ollamaResponse = await axios.post('http://127.0.0.1:11434/v1/chat/completions', ollamaRequest, {
      timeout: 345000,
    });

    logger.debug('[Moderation] Raw Ollama response:', ollamaResponse?.data);

    const responseContent = ollamaResponse?.data?.choices?.[0]?.message?.content;
    if (!responseContent) {
      logger.warn('[Moderation] Invalid Ollama response format:', ollamaResponse?.data);
      return;
    }

    // Parse categories from response
    let categories = parseOllamaResponse(responseContent);

    if (!Array.isArray(categories)) {
      logger.warn('[Moderation] Invalid categories format:', categories);
      return;
    }

    // Format categories to ensure proper capitalization and S# format
    categories = categories.map(category => {
      category = category.toLowerCase().trim();
      // Handle S1-S13 categories
      if (category.match(/^s\d+$/)) {
        const number = category.substring(1);
        if (number >= 1 && number <= 13) {
          return `S${number}`;
        }
      }
      // Handle 'safe' and 'unsafe' categories
      if (category === 'safe' || category === 'unsafe') {
        return category.toLowerCase();
      }
      return category;
    });

    // Create a mock req object if none provided
    const mockReq = req || {
      user: {
        id: message.user,
      },
    };

    // List of all possible unsafe categories
    const unsafeCategories = [
      'unsafe',
      ...Array.from({ length: 13 }, (_, i) => `S${i + 1}`),
    ];

    await saveMessage(
      mockReq,
      {
        messageId: message.messageId,
        conversationId: message.conversationId,
        moderation: {
          categories: categories,
          checkedAt: new Date(),
          source: 'llama-guard3',
          flagged: categories.some(cat => unsafeCategories.includes(cat)),
        },
      },
      { context: 'moderation update' },
    );

    logger.debug('[Moderation] Updated message', {
      messageId: message.messageId,
      conversationId: message.conversationId,
      categories,
    });
  } catch (error) {
    logger.error('[Moderation] Error:', error);
    logger.error('[Moderation] Context:', {
      messageUser: message?.user,
      reqUser: req?.user?.id,
      conversationId: message?.conversationId,
      messageId: message?.messageId,
    });
  }
}

/**
 * Main AskController that handles message processing and moderation
 */
const AskController = async (req, res, next, initializeClient, addTitle) => {
  let {
    text,
    endpointOption,
    conversationId,
    modelDisplayLabel,
    parentMessageId = null,
    overrideParentMessageId = null,
  } = req.body;

  logger.debug('[AskController]', {
    text,
    conversationId,
    ...endpointOption,
    modelsConfig: endpointOption.modelsConfig ? 'exists' : '',
  });

  let userMessage;
  let userMessagePromise;
  let promptTokens;
  let userMessageId;
  let responseMessageId;
  const sender = getResponseSender({
    ...endpointOption,
    model: endpointOption.modelOptions.model,
    modelDisplayLabel,
  });
  const newConvo = !conversationId;
  const user = req.user.id;

  const getReqData = (data = {}) => {
    for (let key in data) {
      if (key === 'userMessage') {
        userMessage = data[key];
        userMessageId = data[key].messageId;
      } else if (key === 'userMessagePromise') {
        userMessagePromise = data[key];
      } else if (key === 'responseMessageId') {
        responseMessageId = data[key];
      } else if (key === 'promptTokens') {
        promptTokens = data[key];
      } else if (!conversationId && key === 'conversationId') {
        conversationId = data[key];
      }
    }
  };

  let getText;

  try {
    const { client } = await initializeClient({ req, res, endpointOption });
    const messageCache = getLogStores(CacheKeys.MESSAGES);
    const { onProgress: progressCallback, getPartialText } = createOnProgress({
      onProgress: throttle(
        ({ text: partialText }) => {
          messageCache.set(responseMessageId, partialText, Time.FIVE_MINUTES);
        },
        3000,
        { trailing: false },
      ),
    });

    getText = getPartialText;

    const getAbortData = () => ({
      sender,
      conversationId,
      userMessagePromise,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId,
      text: getPartialText(),
      userMessage,
      promptTokens,
    });

    const { abortController, onStart } = createAbortController(req, res, getAbortData, getReqData);

    res.on('close', () => {
      logger.debug('[AskController] Request closed');
      if (!abortController) {
        return;
      } else if (abortController.signal.aborted) {
        return;
      } else if (abortController.requestCompleted) {
        return;
      }

      abortController.abort();
      logger.debug('[AskController] Request aborted on close');
    });

    const messageOptions = {
      user,
      parentMessageId,
      conversationId,
      overrideParentMessageId,
      getReqData,
      onStart,
      abortController,
      progressCallback,
      progressOptions: {
        res,
      },
    };

    /** @type {TMessage} */
    let response = await client.sendMessage(text, messageOptions);
    response.endpoint = endpointOption.endpoint;

    const { conversation = {} } = await client.responsePromise;
    conversation.title =
      conversation && !conversation.title ? null : conversation?.title || 'New Chat';

    if (client.options.attachments) {
      userMessage.files = client.options.attachments;
      conversation.model = endpointOption.modelOptions.model;
      delete userMessage.image_urls;
    }

    if (!abortController.signal.aborted) {
      sendMessage(res, {
        final: true,
        conversation,
        title: conversation.title,
        requestMessage: userMessage,
        responseMessage: response,
      });
      res.end();

      if (!client.savedMessageIds.has(response.messageId)) {
        await saveMessage(
          req,
          { ...response, user },
          { context: 'api/server/controllers/AskController.js - response end' },
        );
        // Moderate AI response
        await moderateMessage(response, req);
      }
    }

    if (!client.skipSaveUserMessage) {
      await saveMessage(req, userMessage, {
        context: 'api/server/controllers/AskController.js - don\'t skip saving user message',
      });
      // Moderate user message
      await moderateMessage(userMessage, req);
    }

    if (addTitle && parentMessageId === Constants.NO_PARENT && newConvo) {
      addTitle(req, {
        text,
        response,
        client,
      });
    }
  } catch (error) {
    const partialText = getText && getText();
    handleAbortError(res, req, error, {
      partialText,
      conversationId,
      sender,
      messageId: responseMessageId,
      parentMessageId: userMessageId ?? parentMessageId,
    });
  }
};

module.exports = AskController;