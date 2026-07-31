import { useParams } from 'react-router-dom'
import { REPLACE_ALL_REGISTRY, PER_ITEM_REGISTRY } from '../lib/fieldDescriptors'
import ReplaceAllCollectionPage from './ReplaceAllCollectionPage'
import PerItemCollectionPage from './PerItemCollectionPage'

function CollectionTypePage() {
  const { type } = useParams()

  if (REPLACE_ALL_REGISTRY[type]) return <ReplaceAllCollectionPage />
  if (PER_ITEM_REGISTRY[type]) return <PerItemCollectionPage />

  return <p className="text-rose-600">Unknown collection type: {type}</p>
}

export default CollectionTypePage
