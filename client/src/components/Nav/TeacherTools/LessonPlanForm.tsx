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

interface LessonPlanFormProps {
  onBack: () => void;
}

interface FormData {
  subject: string;
  gradeLevel: string;
  duration: string;
  objectives: string;
  standards: string;
  studentBackground: string;
  accessibilityNeeds: string;
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

export const LessonPlanForm: FC<LessonPlanFormProps> = ({ onBack }) => {
  const { token, user } = useAuthContext() as { token: string | null; user: { id: string } | null };
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    subject: '',
    gradeLevel: '',
    duration: '',
    objectives: '',
    standards: '',
    studentBackground: '',
    accessibilityNeeds: '',
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

      // Calculate durations based on total lesson time
      const totalMinutes = parseInt(formData.duration, 10);
      const openingDuration = Math.round(totalMinutes * 0.1);
      const instructionDuration = Math.round(totalMinutes * 0.3);
      const practiceDuration = Math.round(totalMinutes * 0.3);
      const independentDuration = Math.round(totalMinutes * 0.2);
      const closureDuration = Math.round(totalMinutes * 0.1);

      const promptText = `You are an expert educator and curriculum designer. Create a detailed lesson plan based on the following parameters.

SUBJECT: ${formData.subject}
GRADE LEVEL: ${formData.gradeLevel}
DURATION: ${formData.duration} minutes
LEARNING OBJECTIVES: ${formData.objectives}
STANDARDS ALIGNMENT: ${formData.standards}
STUDENT BACKGROUND: ${formData.studentBackground}
ACCESSIBILITY NEEDS: ${formData.accessibilityNeeds}
${formData.additionalInstructions.length > 0 ? `ADDITIONAL INSTRUCTIONS: ${formData.additionalInstructions}` : ''}

Please structure the lesson plan with the following components:

1. OVERVIEW
- Brief description of the lesson
- Key concepts to be covered
- Essential questions
- Success criteria

2. PREPARATION
- Required materials and resources
- Room setup
- Technology needs
- Pre-lesson tasks

3. LESSON FLOW
[0-10%] OPENING/HOOK (${openingDuration} minutes):
- Engagement strategy
- Connection to prior knowledge
- Introduction of learning objectives

[10-40%] DIRECT INSTRUCTION (${instructionDuration} minutes):
- Key content delivery
- Modeling of skills/concepts
- Check for understanding strategies

[40-70%] GUIDED PRACTICE (${practiceDuration} minutes):
- Student activities
- Group work structure
- Differentiation strategies
- Progress monitoring approach

[70-90%] INDEPENDENT PRACTICE (${independentDuration} minutes):
- Individual student work
- Extension activities
- Support strategies

[90-100%] CLOSURE (${closureDuration} minutes):
- Summary activities
- Assessment of learning objectives
- Preview of next lesson
- Exit ticket details

4. ASSESSMENT
- Formative assessment strategies
- Success criteria alignment
- Student reflection opportunities
- Grading considerations (if applicable)

5. DIFFERENTIATION & ACCOMMODATIONS
- Modifications for diverse learners
- Extension activities for advanced students
- Support strategies for struggling students
- Language support strategies

6. FOLLOW-UP
- Homework assignment (if applicable)
- Parent/guardian communication
- Connection to next lesson
- Additional resources for students

Please provide specific examples, discussion questions, and detailed instructions for each activity. Include timing estimates for each section and transition strategies between activities.

Format the lesson plan in a clear, professional structure using markdown formatting. Include any relevant warnings about potential challenges or areas requiring extra attention.`;

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
        throw new Error(`Failed to generate Lesson Plan: ${errorText}`);
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
      alert(`Error generating Lesson Plan: ${errorMessage}`);
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
        <h2 className="text-xl font-semibold text-text-primary">Create Lesson Plan</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 pb-4"> {/* Added bottom padding */}
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
          <Label className="text-sm text-text-secondary">Duration of Lesson</Label>
          <Input
            type="number"
            value={formData.duration}
            onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
            placeholder="in minutes"
            className={cn(
              'bg-surface-secondary text-text-primary border-border-medium',
              'focus:border-border-heavy focus:ring-1 focus:ring-border-heavy',
            )}
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Objectives</Label>
          <Input
            value={formData.objectives}
            onChange={(e) => setFormData(prev => ({ ...prev, objectives: e.target.value }))}
            placeholder="List main learning objectives"
            className={cn(
              'bg-surface-secondary text-text-primary border-border-medium',
              'focus:border-border-heavy focus:ring-1 focus:ring-border-heavy',
            )}
            required
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Standard Alignment</Label>
          <Select
            value={formData.standards}
            onValueChange={(value) => setFormData(prev => ({ ...prev, standards: value }))}
            required
          >
            <SelectTrigger className="bg-surface-secondary text-text-primary border-border-medium">
              <SelectValue placeholder="Select Standards" />
            </SelectTrigger>
            <SelectContent
              className="bg-surface-secondary text-text-primary border-border-medium max-h-[200px] overflow-y-auto"
              position="popper"
              sideOffset={5}
            >
              <SelectItem value="Michigan K-12 Math Standards">Math Standards</SelectItem>
              <SelectItem value="Michigan K-12 English Language Arts (ELA) Standards">ELA Standards</SelectItem>
              <SelectItem value="Michigan K-12 Science Standards">Science Standards</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Student Background</Label>
          <Select
            value={formData.studentBackground}
            onValueChange={(value) => setFormData(prev => ({ ...prev, studentBackground: value }))}
            required
          >
            <SelectTrigger className="bg-surface-secondary text-text-primary border-border-medium">
              <SelectValue placeholder="Select student background level" />
            </SelectTrigger>
            <SelectContent
              className="bg-surface-secondary text-text-primary border-border-medium max-h-[200px] overflow-y-auto"
              position="popper"
              sideOffset={5}
            >
              <SelectItem value="Little to no pre-existing knowledge">Little To No Knowledge</SelectItem>
              <SelectItem value="some pre-existing knowledge">Some Knowledge</SelectItem>
              <SelectItem value="middle to high level of understanding">Middle to High Knowledge</SelectItem>
              <SelectItem value="mixed knowledge">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-text-secondary">Accessibility Needs (Optional)</Label>
          <Input
            value={formData.accessibilityNeeds}
            onChange={(e) => setFormData(prev => ({ ...prev, accessibilityNeeds: e.target.value }))}
            placeholder="e.g., Autism, ADHD"
            className={cn(
              'bg-surface-secondary text-text-primary border-border-medium',
              'focus:border-border-heavy focus:ring-1 focus:ring-border-heavy',
            )}
          />
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
          {isLoading ? 'Generating Lesson Plan...' : 'Generate Lesson Plan'}
        </Button>
      </form>

      {process.env.NODE_ENV === 'development' && (
        <div className="sticky bottom-0 bg-surface-primary pt-2">
          <AuthDebug token={token} />
        </div>
      )}
    </div>

  );
};

export default LessonPlanForm;