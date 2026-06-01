/**
 * ListItemWithIcon component
 * Renders a list item with an icon on the left and content on the right.
 * Designed for use in glassmorphism UI with proper spacing and accessibility.
 */
function ListItemWithIcon({ icon: Icon, children }) {
  return (
    <li className="flex items-start gap-3">
      <Icon
        className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-teal/80"
        aria-hidden="true"
      />
      <div className="flex-1">{children}</div>
    </li>
  )
}

export default ListItemWithIcon
