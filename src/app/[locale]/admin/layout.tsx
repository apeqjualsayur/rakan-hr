import { TopNav } from "@/components/layout/TopNav";

// Placeholder shell for admin roles. Role-based access is added in build step 3.
export default function AdminLayout({
  children,
}: LayoutProps<"/[locale]/admin">) {
  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-[1800px] px-4 py-8 md:px-16">
        {children}
      </main>
    </>
  );
}
