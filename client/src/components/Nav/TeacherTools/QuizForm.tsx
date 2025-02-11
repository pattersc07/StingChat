import React, { useState } from 'react';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Textarea } from '~/components/ui/Textarea';
import { Label } from '~/components/ui/Label';
import { ArrowLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/Select';
import { v4 as uuidv4 } from 'uuid';
import { useAuthContext } from '~/hooks/AuthContext';

interface QuizFormProps {
  onBack: () => void;
}

interface FormData {
  subject: string;
  gradeLevel: string;
  topic: string;
  numberOfQuestions: string;
  difficultyLevel: string;
  questionTypes: string;
  additionalInstructions: string;
}

const AuthDebug: React.FC<{ token: string | null }> = ({ token }) => {
  if (process.env.NODE_ENV !== 'development') {return null;}

  return (
    <div className="mt-4 p-4 bg-gray-800 rounded-lg">
      <h3 className="text-white text-sm font-semibold mb-2">Auth Debug:</h3>
      <div className="text-xs text-gray-300 space-y-1">
        <div>Token Present: {token ? '✓' : '✗'}</div>
        <div>Token Length: {token?.length ?? 0}</div>
        <div>Token Format: {token?.startsWith('Bearer ') ? 'Has Bearer prefix' : 'No Bearer prefix'}</div>
        <div>Token Preview: {token ? `${token.substring(0, 20)}...` : 'No token'}</div>
      </div>
    </div>
  );
};

export const QuizForm: React.FC<QuizFormProps> = ({ onBack }): JSX.Element => {
  const { token, user } = useAuthContext() as { token: string | null; user: { id: string } | null };
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    subject: '',
    gradeLevel: '',
    topic: '',
    numberOfQuestions: '',
    difficultyLevel: '',
    questionTypes: '',
    additionalInstructions: '',
  });

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (typeof token !== 'string' || token.length === 0) {
        throw new Error('Authentication token is missing');
      }

      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      if (user?.id === undefined || typeof user.id !== 'string') {
        throw new Error('User ID is missing or invalid');
      }

      const messageId = uuidv4();
      const timestamp = new Date().toISOString();

      const promptText = `Please create a ${formData.difficultyLevel} difficulty quiz for ${formData.gradeLevel} students on the subject of ${formData.subject}, specifically covering ${formData.topic}.

Requirements:
- Number of questions: ${formData.numberOfQuestions}
- Question type(s): ${formData.questionTypes}
${formData.additionalInstructions ? `Additional instructions: ${formData.additionalInstructions}` : ''}

Please format the quiz as follows:
1. Title and subject area at the top
2. Clear numbering for each question
3. For multiple choice questions, use A, B, C, D format
4. Provide an answer key at the end
5. Include brief explanations for each answer in the answer key

Begin the quiz now:`;

      const payload = {
        text: promptText,
        messageId,
        userId: user.id,
        clientTimestamp: timestamp,
        conversationId: null,
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        model: 'llama3.2:latest',
        endpoint: 'ollama',
        endpointType: 'custom',
        modelDisplayLabel: 'Ollama',
        sender: 'User',
        isCreatedByUser: true,
        error: false,
        generation: '',
        isContinued: false,
        overrideParentMessageId: null,
        responseMessageId: null,
        key: 'never',
      } as const;

      const response = await fetch('/api/ask/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to generate quiz: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (reader === undefined) {
        throw new Error('Failed to get response reader');
      }

      let conversationId: string | null = null;
      let isComplete = false;

      try {
        while (!isComplete) {
          const { done, value } = await reader.read();

          if (done) {
            isComplete = true;
            break;
          }

          if (value instanceof Uint8Array) {
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(line.substring(6)) as {
                    message?: {
                      conversationId?: string;
                    };
                    final?: boolean;
                    done?: boolean;
                  };

                  // Store the conversation ID when we first see it
                  if (!conversationId && parsed.message?.conversationId) {
                    conversationId = parsed.message.conversationId;
                    console.log('Found conversation ID:', conversationId);
                  }

                  // Check for completion signals
                  if (parsed.final === true || parsed.done === true) {
                    console.log('Received completion signal');
                    isComplete = true;
                  }
                } catch (e) {
                  // Continue if we can't parse this line
                  continue;
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Add a small delay to ensure all processing is complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Only redirect after we're sure everything is complete
      if (typeof conversationId === 'string' && conversationId.length > 0) {
        console.log('Generation complete, redirecting to:', `/chat/${conversationId}`);
        window.location.href = `/c/${conversationId}`;
      } else {
        throw new Error('No conversation ID found in response');
      }

    } catch (error) {
      console.error('Error in handleSubmit:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      alert(`Error generating quiz: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={onBack}
          className="p-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold text-white">Create Quiz</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm text-gray-400">Subject</Label>
          <Input
            value={formData.subject}
            onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
            placeholder="e.g., Mathematics"
            className="bg-[#2a2a2a] text-white border-0"
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-gray-400">Grade Level</Label>
          <Input
            value={formData.gradeLevel}
            onChange={(e) => setFormData(prev => ({ ...prev, gradeLevel: e.target.value }))}
            placeholder="e.g., 9th Grade"
            className="bg-[#2a2a2a] text-white border-0"
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-gray-400">Topic</Label>
          <Input
            value={formData.topic}
            onChange={(e) => setFormData(prev => ({ ...prev, topic: e.target.value }))}
            placeholder="e.g., Quadratic Equations"
            className="bg-[#2a2a2a] text-white border-0"
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-gray-400">Number of Questions</Label>
          <Input
            type="number"
            value={formData.numberOfQuestions}
            onChange={(e) => setFormData(prev => ({ ...prev, numberOfQuestions: e.target.value }))}
            placeholder="e.g., 10"
            className="bg-[#2a2a2a] text-white border-0"
            required
            min="1"
            max="50"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-gray-400">Difficulty Level</Label>
          <Select
            value={formData.difficultyLevel}
            onValueChange={(value) => setFormData(prev => ({ ...prev, difficultyLevel: value }))}
            required
          >
            <SelectTrigger className="bg-[#2a2a2a] text-white border-0">
              <SelectValue placeholder="Select difficulty" />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2a2a] text-white">
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-gray-400">Question Types</Label>
          <Select
            value={formData.questionTypes}
            onValueChange={(value) => setFormData(prev => ({ ...prev, questionTypes: value }))}
            required
          >
            <SelectTrigger className="bg-[#2a2a2a] text-white border-0">
              <SelectValue placeholder="Select question type" />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2a2a] text-white">
              <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
              <SelectItem value="true-false">True/False</SelectItem>
              <SelectItem value="short-answer">Short Answer</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-gray-400">Additional Instructions (Optional)</Label>
          <Textarea
            value={formData.additionalInstructions}
            onChange={(e) => setFormData(prev => ({ ...prev, additionalInstructions: e.target.value }))}
            placeholder="Any specific requirements or instructions..."
            className="bg-[#2a2a2a] text-white border-0 min-h-[100px]"
          />
        </div>

        <Button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          disabled={isLoading}
        >
          {isLoading ? 'Generating Quiz...' : 'Generate Quiz'}
        </Button>
      </form>

      {process.env.NODE_ENV === 'development' && <AuthDebug token={token} />}
    </div>
  );
};

export default QuizForm;
