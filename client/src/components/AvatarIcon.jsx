/**
 * Renders a react-kawaii character as the user's avatar.
 * Replaces the old getCatSvg + dangerouslySetInnerHTML pattern.
 */
export function AvatarIcon({ avatar, size, uniqueId }) {
  if (!avatar) return null;
  const Component = avatar.component;
  return <Component size={size} color={avatar.color} mood={avatar.mood} uniqueId={uniqueId} />;
}
