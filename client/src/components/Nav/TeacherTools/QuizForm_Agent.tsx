import { type FC, useState } from 'react';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Textarea } from '~/components/ui/Textarea';
import { Label } from '~/components/ui/Label';
import { ArrowLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/Select';
import { v4 as uuidv4 } from 'uuid';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils';

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

const AuthDebug: FC<{ token: string | null }> = ({ token }) => {
  if (process.env.NODE_ENV !== 'development') {return null;}

  return (
    <div className="mt-4 p-4 bg-surface-secondary rounded-lg">
      <h3 className="text-text-primary text-sm font-semibold mb-2">Auth Debug:</h3>
      <div className="text-xs text-text-secondary space-y-1">
        <div>Token Present: {token !== null ? '✓' : '✗'}</div>
        <div>Token Length: {token?.length ?? 0}</div>
        <div>Token Format: {token !== null && token.startsWith('Bearer ') ? 'Has Bearer prefix' : 'No Bearer prefix'}</div>
        <div>Token Preview: {token !== null ? `${token.substring(0, 20)}...` : 'No token'}</div>
      </div>
    </div>
  );
};

export const AgentQuizForm: FC<QuizFormProps> = ({ onBack }) => {
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
      if (token === null || token.length === 0) {
        throw new Error('Authentication token is missing');
      }

      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      if (user === null || typeof user.id !== 'string') {
        throw new Error('User ID is missing or invalid');
      }

      const messageId = uuidv4();
      const timestamp = new Date().toISOString();

      const promptText = `Please create a ${formData.difficultyLevel} difficulty quiz for ${formData.gradeLevel} students on the subject of ${formData.subject}, specifically covering ${formData.topic}.

Requirements:
- Number of questions: ${formData.numberOfQuestions}
- Question type(s): ${formData.questionTypes}
${formData.additionalInstructions.length > 0 ? `Additional instructions: ${formData.additionalInstructions}` : ''}

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
        agent_id: 'agent_87KTLpadD4-fV58INFtBR',
        clientTimestamp: timestamp,
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        spec: 'llama3.2:latest',
        endpoint: 'agents',
        sender: 'User',
        isCreatedByUser: true,
        error: false,
        generation: '',
        iconURL: 'agents',
        isContinued: false,
        responseMessageId: null,
        key: '2025-01-29T21:38:57.187Z',
      } as const;

      const response = await fetch('/api/agents/chat', {
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

                  if (conversationId === null && parsed.message?.conversationId !== undefined) {
                    conversationId = parsed.message.conversationId;
                    console.log('Found conversation ID:', conversationId);
                  }

                  if (parsed.final === true || parsed.done === true) {
                    console.log('Received completion signal');
                    isComplete = true;
                  }
                } catch (e) {
                  continue;
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      if (conversationId !== null && conversationId.length > 0) {
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
    <div className="space-y-6 overflow-y-auto px-1"> {/* Added overflow handling and slight padding */}
      <div className="flex items-center gap-4 top-0 sticky py-2 z-10"> {/* Made header sticky */}
        <Button
          variant="ghost"
          onClick={onBack}
          className="p-2 hover:bg-surface-hover"
        >
          <ArrowLeft className="h-4 w-4 text-text-primary" />
        </Button>
        <h2 className="text-xl font-semibold text-text-primary">Create Quiz</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 pb-4">
        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Subject</Label>
          <Input
            value={formData.subject}
            onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
            placeholder="e.g., Mathematics"
            className={cn(
              'bg-surface-secondary text-text-primary border-border-medium',
              'focus:border-border-heavy focus:ring-1 focus:ring-border-heavy',
            )}
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Grade Level</Label>
          <Input
            value={formData.gradeLevel}
            onChange={(e) => setFormData(prev => ({ ...prev, gradeLevel: e.target.value }))}
            placeholder="e.g., 9th Grade"
            className={cn(
              'bg-surface-secondary text-text-primary border-border-medium',
              'focus:border-border-heavy focus:ring-1 focus:ring-border-heavy',
            )}
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Topic</Label>
          <Input
            value={formData.topic}
            onChange={(e) => setFormData(prev => ({ ...prev, topic: e.target.value }))}
            placeholder="e.g., Quadratic Equations"
            className={cn(
              'bg-surface-secondary text-text-primary border-border-medium',
              'focus:border-border-heavy focus:ring-1 focus:ring-border-heavy',
            )}
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Number of Questions</Label>
          <Input
            type="number"
            value={formData.numberOfQuestions}
            onChange={(e) => setFormData(prev => ({ ...prev, numberOfQuestions: e.target.value }))}
            placeholder="e.g., 10"
            className={cn(
              'bg-surface-secondary text-text-primary border-border-medium',
              'focus:border-border-heavy focus:ring-1 focus:ring-border-heavy',
            )}
            required
            min="1"
            max="50"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Difficulty Level</Label>
          <Select
            value={formData.difficultyLevel}
            onValueChange={(value) => setFormData(prev => ({ ...prev, difficultyLevel: value }))}
            required
          >
            <SelectTrigger className="bg-surface-secondary text-text-primary border-border-medium">
              <SelectValue placeholder="Select difficulty" />
            </SelectTrigger>
            <SelectContent
              className="bg-surface-secondary text-text-primary border-border-medium max-h-[200px] overflow-y-auto"
              position="popper"
              sideOffset={5}
            >
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Question Types</Label>
          <Select
            value={formData.questionTypes}
            onValueChange={(value) => setFormData(prev => ({ ...prev, questionTypes: value }))}
            required
          >
            <SelectTrigger className="bg-surface-secondary text-text-primary border-border-medium">
              <SelectValue placeholder="Select question type" />
            </SelectTrigger>
            <SelectContent
              className="bg-surface-secondary text-text-primary border-border-medium max-h-[200px] overflow-y-auto"
              position="popper"
              sideOffset={5}
            >
              <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
              <SelectItem value="true-false">True/False</SelectItem>
              <SelectItem value="short-answer">Short Answer</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Additional Instructions (Optional)</Label>
          <Textarea
            value={formData.additionalInstructions}
            onChange={(e) => setFormData(prev => ({ ...prev, additionalInstructions: e.target.value }))}
            placeholder="Any specific requirements or instructions..."
            className={cn(
              'bg-surface-secondary text-text-primary border-border-medium',
              'focus:border-border-heavy focus:ring-1 focus:ring-border-heavy',
              'min-h-[100px]',
            )}
          />
        </div>

        <Button
          type="submit"
          className={cn(
            'w-full bg-surface-primary hover:bg-surface-hover',
            'text-text-primary transition-colors duration-200',
          )}
          disabled={isLoading}
        >
          {isLoading ? 'Generating Quiz...' : 'Generate Quiz'}
        </Button>
      </form>

      {process.env.NODE_ENV === 'development' && <AuthDebug token={token} />}
    </div>
  );
};

export default AgentQuizForm;