// A template (unlike a layout) remounts on every navigation,
// so each page fades up into place.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
