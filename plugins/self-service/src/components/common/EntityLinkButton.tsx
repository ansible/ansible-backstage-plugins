import { useNavigate } from 'react-router-dom';

interface EntityLinkButtonProps {
  linkPath: string;
  className?: string;
  children: React.ReactNode;
}

export const EntityLinkButton = ({
  linkPath,
  className,
  children,
}: EntityLinkButtonProps) => {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(linkPath);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={(e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(linkPath);
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
};
