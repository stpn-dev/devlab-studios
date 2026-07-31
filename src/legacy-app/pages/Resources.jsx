import { createElement, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useParams } from 'react-router-dom'
import PageSeo from '../../components/PageSeo'
import SectionHeader from '../../components/SectionHeader'
import PrimaryButton from '../../components/PrimaryButton'
import * as Icons from '../../components/icons/icons'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Code2,
  MessageSquare,
} from '../../components/icons/icons'
import { useResourcesContent } from '../../hooks/useResourcesContent'

function resolveIcon(name) {
  return Icons[name] || Icons.Lightbulb
}

function renderResourceIcon(name, props) {
  return createElement(resolveIcon(name), props)
}

function formatDate(value) {
  if (!value) return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function slugifyLabel(value) {
  return String(value || '').trim().toLowerCase()
}

function renderBody(body) {
  const lines = String(body || '').split(/\r?\n/)
  const blocks = []
  let paragraph = []
  let bulletList = []

  function flushParagraph() {
    if (!paragraph.length) return
    blocks.push({
      type: 'paragraph',
      text: paragraph.join(' '),
    })
    paragraph = []
  }

  function flushBulletList() {
    if (!bulletList.length) return
    blocks.push({
      type: 'list',
      items: [...bulletList],
    })
    bulletList = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushBulletList()
      continue
    }

    if (line.startsWith('## ')) {
      flushParagraph()
      flushBulletList()
      blocks.push({
        type: 'heading',
        text: line.slice(3).trim(),
      })
      continue
    }

    if (line.startsWith('- ')) {
      flushParagraph()
      bulletList.push(line.slice(2).trim())
      continue
    }

    flushBulletList()
    paragraph.push(line)
  }

  flushParagraph()
  flushBulletList()

  return blocks.map((block, index) => {
    if (block.type === 'heading') {
      return (
        <h2 key={`heading-${index}`} className="mt-8 text-2xl font-semibold text-brand-ink first:mt-0">
          {block.text}
        </h2>
      )
    }

    if (block.type === 'list') {
      return (
        <ul key={`list-${index}`} className="mt-4 grid gap-3 text-base leading-relaxed text-slate-700">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3">
              <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0 text-brand-teal" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    }

    return (
      <p key={`paragraph-${index}`} className="mt-4 text-base leading-8 text-slate-700 first:mt-0">
        {block.text}
      </p>
    )
  })
}

function ResourceFeedCard({ post, featured = false }) {
  return (
    <article className={`rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_18px_45px_rgba(60,28,120,0.10)] ${featured ? 'overflow-hidden' : 'p-6 sm:p-7'}`}>
      {featured ? (
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex min-h-[260px] items-center justify-center bg-gradient-to-br from-brand-ink via-[#22185a] to-[#3526b5] p-8 text-white">
            {post.coverImageUrl ? (
              <img
                src={post.coverImageUrl}
                alt={post.title}
                className="max-h-[360px] w-full rounded-2xl object-cover shadow-[0_16px_42px_rgba(0,0,0,0.28)]"
                loading="eager"
              />
            ) : (
              <div className="flex h-full min-h-[220px] w-full flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white">
                  {renderResourceIcon(post.icon, { className: 'h-6 w-6', 'aria-hidden': 'true' })}
                </div>
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/70">{post.category}</p>
                <p className="mt-2 text-2xl font-semibold">{post.title}</p>
              </div>
            )}
          </div>

          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-mint px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal">
                Featured
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {post.category}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {post.contentType}
              </span>
            </div>

            <h2 className="mt-4 text-3xl font-semibold text-brand-ink">{post.title}</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">{post.summary}</p>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-slate-500">
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                {formatDate(post.publishedAt)}
              </span>
              {post.readingTimeMinutes ? (
                <span className="inline-flex items-center gap-2">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  {post.readingTimeMinutes} min read
                </span>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {(post.tags || []).map((tag) => (
                <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-6">
              <PrimaryButton to={`/resources/${post.slug}`} showIcon>
                Read Article
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
              {renderResourceIcon(post.icon, { className: 'h-5 w-5', 'aria-hidden': 'true' })}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {post.category}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {post.contentType}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-brand-ink">{post.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{post.summary}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-slate-500">
            {post.publishedAt ? (
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                {formatDate(post.publishedAt)}
              </span>
            ) : null}
            {post.readingTimeMinutes ? (
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {post.readingTimeMinutes} min read
              </span>
            ) : null}
            <span>{post.authorName || 'DevLab Studios'}</span>
          </div>

          {(post.points || []).length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {post.points.map((point) => (
                <span key={point} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {point}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(post.tags || []).map((tag) => (
                <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                  {tag}
                </span>
              ))}
            </div>

            <a
              href={`/resources/${post.slug}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-teal transition hover:text-brand-tealDark"
            >
              Read more
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </>
      )}
    </article>
  )
}

function ResourcesIndex({ posts, playbook }) {
  const [activeFilter, setActiveFilter] = useState('all')
  const sortedPosts = [...posts].sort((left, right) => {
    const leftTime = new Date(left.publishedAt || 0).getTime()
    const rightTime = new Date(right.publishedAt || 0).getTime()
    if (leftTime !== rightTime) return rightTime - leftTime
    return (left.sortOrder || 0) - (right.sortOrder || 0)
  })

  const featuredPost = sortedPosts.find((post) => post.isFeatured) || sortedPosts[0] || null
  const filterOptions = [
    { id: 'all', label: 'All posts' },
    ...Array.from(new Set(sortedPosts.map((post) => slugifyLabel(post.contentType)).filter(Boolean))).map((key) => ({
      id: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
    })),
  ]
  const filteredPosts = sortedPosts.filter((post) => {
    if (activeFilter === 'all') return post.id !== featuredPost?.id
    return slugifyLabel(post.contentType) === activeFilter && post.id !== featuredPost?.id
  })

  return (
    <>
      <PageSeo pageSlug="resources" />

      <div className="space-y-10">
        <section className="rounded-[28px] bg-gradient-to-br from-brand-mint/55 via-white to-[#f3efff] p-6 shadow-[0_20px_44px_rgba(46,34,98,0.12)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-teal">Resources</p>
              <h1 className="text-4xl font-semibold leading-tight text-brand-ink sm:text-5xl">
                Guides, AI updates, and operational notes for modern workflows.
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-slate-700 sm:text-lg">
                A CMS-managed feed of practical implementation notes across AI automation, websites, systems design, delivery workflows, and business operations.
              </p>
              <div className="flex flex-wrap gap-3">
                <PrimaryButton to="/services">
                  <Code2 size={16} />
                  Explore Solutions
                </PrimaryButton>
                <PrimaryButton to="/contact" variant="secondary">
                  <MessageSquare size={16} />
                  Ask About a Workflow
                </PrimaryButton>
              </div>
            </div>

            <div className="rounded-[24px] bg-white/90 p-6 shadow-[0_16px_34px_rgba(48,28,114,0.10)] ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">Automation Readiness</p>
              <h2 className="mt-2 text-2xl font-semibold text-brand-ink">Start with workflow clarity.</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {playbook.map((item) => (
                  <li key={item} className="flex gap-3 leading-relaxed">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-teal" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {featuredPost ? (
          <section className="space-y-6">
            <SectionHeader
              title="Featured Insight"
              subtitle="Longer-form guidance and implementation notes with enough detail to read, not just skim."
            />
            <ResourceFeedCard post={featuredPost} featured />
          </section>
        ) : null}

        <section className="space-y-6">
          <SectionHeader
            title="Latest From the Feed"
            subtitle="A practical mix of evergreen guides, automation notes, and current AI or systems insights."
          />

          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setActiveFilter(option.id)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeFilter === option.id
                    ? 'border-brand-teal bg-brand-teal text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-teal/40 hover:text-brand-teal'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid gap-5">
            {filteredPosts.map((post) => (
              <ResourceFeedCard key={post.id} post={post} />
            ))}
          </div>
        </section>

        <section className="rounded-[28px] bg-gradient-to-r from-brand-ink via-[#22185a] to-[#3120a3] p-6 text-white shadow-[0_22px_50px_rgba(20,13,64,0.22)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Need implementation?</p>
              <h2 className="mt-2 text-3xl font-semibold">Turn the article into a working system.</h2>
              <p className="mt-3 text-white/75">
                DevLab Studios can map the process, choose the stack, and build the website, automation, or internal workflow around your current tools.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <PrimaryButton to="/contact">
                <MessageSquare size={16} />
                Start a Conversation
              </PrimaryButton>
              <PrimaryButton to="/services" variant="secondary">
                <ArrowRight size={16} />
                View Services
              </PrimaryButton>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

function ResourcesDetail({ post, relatedPosts }) {
  const seoTitle = `${post.title} | DevLab Studios Resources`
  const seoDescription = post.summary
  const canonicalUrl = `https://www.devlabstudios.com/resources/${post.slug}`
  const imageUrl = post.coverImageUrl || 'https://www.devlabstudios.com/devlabstudios-logo-only.png'

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={imageUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDescription} />
        <meta name="twitter:image" content={imageUrl} />
      </Helmet>

      <div className="space-y-8">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <a href="/resources" className="inline-flex items-center gap-2 font-semibold text-brand-teal transition hover:text-brand-tealDark">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Resources
          </a>
          <span>/</span>
          <span>{post.title}</span>
        </nav>

        <section className="rounded-[28px] bg-gradient-to-br from-brand-mint/55 via-white to-[#f3efff] p-6 shadow-[0_20px_44px_rgba(46,34,98,0.12)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-mint px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal">
                  {post.category}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {post.contentType}
                </span>
              </div>

              <h1 className="text-4xl font-semibold leading-tight text-brand-ink sm:text-5xl">{post.title}</h1>
              <p className="max-w-3xl text-base leading-relaxed text-slate-700 sm:text-lg">{post.summary}</p>

              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                <span>{post.authorName || 'DevLab Studios'}</span>
                {post.publishedAt ? (
                  <span className="inline-flex items-center gap-2">
                    <Calendar className="h-4 w-4" aria-hidden="true" />
                    {formatDate(post.publishedAt)}
                  </span>
                ) : null}
                {post.readingTimeMinutes ? (
                  <span className="inline-flex items-center gap-2">
              <Clock className="h-4 w-4" aria-hidden="true" />
                    {post.readingTimeMinutes} min read
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {(post.tags || []).map((tag) => (
                  <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex min-h-[280px] items-center justify-center rounded-[24px] bg-gradient-to-br from-brand-ink via-[#22185a] to-[#3526b5] p-8 text-white shadow-[0_16px_36px_rgba(20,13,64,0.22)]">
              {post.coverImageUrl ? (
                <img
                  src={post.coverImageUrl}
                  alt={post.title}
                  className="max-h-[380px] w-full rounded-2xl object-cover shadow-[0_16px_42px_rgba(0,0,0,0.28)]"
                />
              ) : (
                <div className="flex h-full min-h-[220px] w-full flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white">
                    {renderResourceIcon(post.icon, { className: 'h-7 w-7', 'aria-hidden': 'true' })}
                  </div>
                  <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/70">{post.category}</p>
                  <p className="mt-2 text-2xl font-semibold">{post.title}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_rgba(60,28,120,0.10)] sm:p-8">
            <div className="prose prose-slate max-w-none">
              {renderBody(post.body)}
            </div>
          </article>

          <aside className="space-y-6">
            {(post.points || []).length > 0 ? (
              <section className="rounded-[24px] bg-white p-6 shadow-[0_18px_45px_rgba(60,28,120,0.10)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">Key Takeaways</p>
                <ul className="mt-4 grid gap-3 text-sm text-slate-700">
                  {post.points.map((point) => (
                    <li key={point} className="flex gap-3 leading-relaxed">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-teal" aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {relatedPosts.length > 0 ? (
              <section className="rounded-[24px] bg-white p-6 shadow-[0_18px_45px_rgba(60,28,120,0.10)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">More From Resources</p>
                <div className="mt-4 grid gap-4">
                  {relatedPosts.map((item) => (
                    <a
                      key={item.id}
                      href={`/resources/${item.slug}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-brand-teal/30 hover:bg-white"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.category}</p>
                      <p className="mt-2 text-sm font-semibold text-brand-ink">{item.title}</p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-500">{item.summary}</p>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  )
}

function Resources() {
  const { posts, playbook } = useResourcesContent()
  const { slug } = useParams()
  const publishedPosts = (posts || []).filter((post) => post.status !== 'draft')
  const activePost = slug
    ? publishedPosts.find((post) => post.slug === slug || post.id === slug)
    : null

  if (slug && !activePost) {
    return (
      <>
        <PageSeo pageSlug="resources" />
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_18px_45px_rgba(60,28,120,0.10)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">Resources</p>
          <h1 className="mt-3 text-3xl font-semibold text-brand-ink">Article not found</h1>
          <p className="mt-3 text-slate-600">The resource you tried to open is missing or no longer published.</p>
          <div className="mt-6 flex justify-center">
            <PrimaryButton to="/resources">
              <ArrowLeft size={16} />
              Back to Resources
            </PrimaryButton>
          </div>
        </div>
      </>
    )
  }

  if (activePost) {
    const relatedPosts = publishedPosts
      .filter((post) => post.id !== activePost.id)
      .slice(0, 3)

    return <ResourcesDetail post={activePost} relatedPosts={relatedPosts} />
  }

  return <ResourcesIndex posts={publishedPosts} playbook={playbook || []} />
}

export default Resources
