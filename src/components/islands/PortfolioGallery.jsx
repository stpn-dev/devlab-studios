import { useState } from 'react'
import PortfolioRow from '../PortfolioRow'
import ImageModal from '../ImageModal'

const CATEGORIES = [
  { label: 'Automation Buildouts', value: 'Automation' },
  { label: 'Website Buildouts', value: 'Website' },
]

function PortfolioGallery({ projects }) {
  const [selectedImage, setSelectedImage] = useState(null)
  const [category, setCategory] = useState('Automation')

  const filteredItems = projects.filter((item) =>
    category === 'Website' ? item.type === 'Website' : item.type === 'Automation',
  )

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            className={`rounded-full px-4 py-2 font-semibold transition-colors duration-200 ${
              category === cat.value ? 'bg-brand-teal text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-brand-ink'
            }`}
            onClick={() => setCategory(cat.value)}
            type="button"
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {filteredItems.map((project) => (
          <PortfolioRow key={project.id} project={project} onImageClick={(image) => setSelectedImage(image)} />
        ))}
      </div>

      <ImageModal
        src={selectedImage?.url || ''}
        alt={selectedImage?.altText || 'Portfolio project screenshot'}
        isOpen={Boolean(selectedImage)}
        onClose={() => setSelectedImage(null)}
        caption={selectedImage?.altText || ''}
      />
    </>
  )
}

export default PortfolioGallery
