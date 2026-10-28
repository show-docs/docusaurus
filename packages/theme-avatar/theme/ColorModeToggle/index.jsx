import ColorModeToggle from '@theme-init/ColorModeToggle';

import { Avatar } from './avatar.jsx';

export default function ColorModeToggleWrapper(props) {
  return (
    <>
      <ColorModeToggle {...props} />
      <Avatar />
    </>
  );
}
