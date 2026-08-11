import { Sparkles, X } from 'lucide-react';

interface AgentButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export const AgentButton = ({ isOpen, onClick }: AgentButtonProps) => {
  return (
    <button 
      className="agent-fab" 
      onClick={onClick}
      title="Ask AI Agent (Ctrl+/)"
      style={{ bottom: '38px', right: '280px', zIndex: 50 }}
    >
      {isOpen ? <X size={24} /> : <Sparkles size={24} />}
    </button>
  );
};

