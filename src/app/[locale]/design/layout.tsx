import { notFound } from "next/navigation";

// /design is a development tool (build step 2): component gallery and reference
// screen recreations with dummy data. It is not available in production builds.
export default function DesignLayout({
  children,
}: LayoutProps<"/[locale]/design">) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
