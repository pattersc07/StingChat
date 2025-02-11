import { type FC, useState } from 'react';
import { Menu, MenuButton } from '@headlessui/react';
import { GraduationCap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import { QuizForm } from './QuizForm';
import { LessonPlanForm } from './LessonPlanForm';
import { AgentQuizForm } from './QuizForm_Agent';
import { cn } from '~/utils';

type TeacherToolsProps = {
  isSmallScreen: boolean;
  toggleNav: () => void;
};

const tools = [
  {
    id: 'agentquiz' as const,
    title: 'Agent Quiz Maker',
    description: 'Create interactive quizzes and assessments for your students.',
    icon: GraduationCap,
  },
  {
    id: 'lesson' as const,
    title: 'Lesson Planner',
    description: 'Design and organize lesson plans with AI assistance.',
    icon: GraduationCap,
  },
  {
    id: 'quiz' as const,
    title: 'Quiz Maker',
    description: 'Use Agents Create interactive quizzes and assessments for your students.',
    icon: GraduationCap,
  },
] as const;

type ToolType = typeof tools[number]['id'];

const TeacherTools: FC<TeacherToolsProps> = ({ isSmallScreen, toggleNav }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);

  const handleClose = () => {
    setIsOpen(false);
    setActiveTool(null);
  };

  const handleBack = () => {
    setActiveTool(null);
  };

  const getDialogTitle = () => {
    if (activeTool === null) {return 'Teacher Tools';}
    const tool = tools.find(t => t.id === activeTool);
    return tool?.title ?? 'Teacher Tools';
  };

  return (
    <Menu as="div" className="group relative">
      {({ open }) => (
        <>
          <MenuButton
            className={cn(
              'flex items-center justify-start gap-3 rounded-md px-3 py-3 text-sm transition-colors duration-200 hover:bg-surface-active-alt text-token-text-primary bg-transparent w-full',
              open ? 'bg-surface-active-alt' : '',
              isSmallScreen ? 'h-12' : '',
            )}
            onClick={() => setIsOpen(true)}
          >
            <GraduationCap className="h-4 w-4" />
            Teacher Tools
          </MenuButton>

          <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto bg-surface-primary border-border-medium">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold text-text-primary">
                  {getDialogTitle()}
                </DialogTitle>
              </DialogHeader>

              {activeTool === null ? (
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tools.map((tool) => (
                      <button
                        key={tool.id}
                        onClick={() => {
                          setActiveTool(tool.id);
                          if (isSmallScreen) {
                            toggleNav();
                          }
                        }}
                        className="flex flex-col items-start space-y-3 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border-medium h-auto w-full p-6"
                      >
                        <div className="flex items-center space-x-3 w-full">
                          <div className="rounded-lg bg-surface-tertiary p-2">
                            <tool.icon className="h-5 w-5 text-text-primary" />
                          </div>
                          <h3 className="text-lg font-medium text-text-primary">
                            {tool.title}
                          </h3>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed text-left text-wrap">
                          {tool.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  {activeTool === 'agentquiz' && <AgentQuizForm onBack={handleBack} />}
                  {activeTool === 'lesson' && <LessonPlanForm onBack={handleBack} />}
                  {activeTool === 'quiz' && <QuizForm onBack={handleBack} />}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </Menu>
  );
};

export default TeacherTools;