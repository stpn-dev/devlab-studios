import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import PortfolioRow from '../components/PortfolioRow'
import SectionHeader from '../components/SectionHeader'
import ImageModal from '../components/ImageModal'
import { portfolioItems } from '../data/portfolio'

function Portfolio() {
  const [selectedImage, setSelectedImage] = useState(null)
  const [category, setCategory] = useState('Website')

  const categories = [
    { label: 'Website Buildouts', value: 'Website' },
    { label: 'Automation Buildouts', value: 'Automation' },
  ]

  const filteredItems = portfolioItems.filter((item) => 
    category === 'Website' 
      ? item.type === 'Website' 
      : item.type === 'Automation' || item.type === 'AI Automation'
  )

  return (
    <>
      <Helmet>
        <title>Portfolio – Website &amp; AI Automation Projects | Devlab Studios</title>
        <meta name="description" content="Portfolio of Stephen Agustinez — software engineer and AI automation specialist. Projects include React landing pages, Laravel full-stack apps, automation systems, API-connected workflows, and AI-assisted business tooling." />
        <meta name="keywords" content="software engineer portfolio, AI automation portfolio, React landing page, Laravel website, API integration project, backend workflow automation, n8n workflow, business automation examples" />
        <meta property="og:title" content="Portfolio – Website &amp; AI Automation Projects | Devlab Studios" />
        <meta property="og:description" content="Website development, backend integration, and AI automation projects by Stephen Agustinez — React, Laravel, APIs, n8n, and more." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.devlabstudios.com/portfolio" />
        <meta property="og:image" content="/screenshots/portfolio-portfolio.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Portfolio – Website &amp; AI Automation Projects | Devlab Studios" />
        <meta name="twitter:description" content="Website development, backend integration, and AI automation projects — React, Laravel, APIs, and workflow systems." />
        <meta name="twitter:image" content="/screenshots/portfolio-portfolio.png" />
      </Helmet>
    <div className="space-y-8">
      <SectionHeader
        title="Portfolio"
        subtitle="Selected builds, automations, and interface work."
      />

      {/* Category Tabs */}
      <div className="flex gap-2 mb-4">
        {categories.map((cat) => (
          <button
            key={cat.value}
            className={`px-4 py-2 rounded-full font-semibold transition-colors duration-200 ${category === cat.value ? 'bg-navy-600 text-white' : 'bg-navy-800 text-navy-200 hover:bg-navy-700'}`}
            onClick={() => setCategory(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {filteredItems.map((project) => (
          <PortfolioRow
            key={project.id}
            project={project}
            onImageClick={() => setSelectedImage(project.image)}
          />
        ))}
        {filteredItems.length === 0 && (
          <div className="py-8 text-center text-navy-200">No projects in this category yet.</div>
        )}
      </div>

      {/* Image Modal */}
      <ImageModal
        src={selectedImage}
        alt="Portfolio project screenshot"
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </div>
    </>
  )
}

export default Portfolio
