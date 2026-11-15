import Icon from './Icon.jsx';
import './fab.css';

// Floating action button: 56px accent circle with a plus (or a given icon).
// `label` is required and becomes the aria-label. Position is fixed
// bottom-right above --tabbar-h and the bottom safe area; see fab.css.
export default function Fab({ label, onClick, icon = 'plus', className = '', ...rest }) {
  return (
    <button type="button" className={`ui-fab ${className}`.trim()} aria-label={label} onClick={onClick} {...rest}>
      {typeof icon === 'string' ? <Icon name={icon} size={24} /> : icon}
    </button>
  );
}
