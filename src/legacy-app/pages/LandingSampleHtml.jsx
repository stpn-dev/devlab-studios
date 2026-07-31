import { Helmet } from 'react-helmet-async'

export default function LandingSampleHtml() {
  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <div className="min-h-screen bg-[#f7f7f5] text-[#222]">
      <main className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <header className="border-b border-[#d7d7d2] pb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-[#666]">HTML / CSS / JavaScript</p>
          <h1 className="mt-4 text-5xl font-light leading-tight sm:text-6xl">Editorial Minimal Landing Page</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#555]">
            A static-first page focused on semantics, readability, and speed. No framework dependencies, just clean structure and intentional design.
          </p>
        </header>

        <section className="grid gap-10 py-14 md:grid-cols-3">
          <article className="md:col-span-2">
            <h2 className="text-3xl font-light">Why this style works</h2>
            <p className="mt-4 leading-8 text-[#4d4d4d]">
              For service sites and brochure pages, clarity beats complexity. This layout emphasizes copy hierarchy, whitespace, and typography to build trust quickly.
            </p>
            <p className="mt-4 leading-8 text-[#4d4d4d]">
              It performs extremely well, is easy to maintain, and is ideal for clients who value straightforward presentation.
            </p>
          </article>

          <aside className="border border-[#d8d8d3] bg-white p-6">
            <h3 className="text-xl font-medium">Core Stack</h3>
            <ul className="mt-4 space-y-2 text-[#555]">
              <li>Semantic HTML5</li>
              <li>Modern CSS (Flex/Grid)</li>
              <li>Vanilla JavaScript</li>
            </ul>
          </aside>
        </section>

        <section className="border-t border-[#d7d7d2] pt-12">
          <h2 className="text-2xl font-light">Process</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-3xl font-light">01</p>
              <p className="mt-2 text-[#555]">Plan information architecture</p>
            </div>
            <div>
              <p className="text-3xl font-light">02</p>
              <p className="mt-2 text-[#555]">Design and write content-first sections</p>
            </div>
            <div>
              <p className="text-3xl font-light">03</p>
              <p className="mt-2 text-[#555]">Optimize performance and accessibility</p>
            </div>
          </div>
        </section>

        <footer className="mt-16 border-t border-[#d7d7d2] pt-8 text-sm text-[#666]">
          Sample website build for portfolio presentation.
        </footer>
      </main>
      </div>
    </>
  )
}
