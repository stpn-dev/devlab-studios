import { Helmet } from 'react-helmet-async'
import { usePageSeo } from '../hooks/usePageSeo'

function PageSeo({ pageSlug }) {
  const seo = usePageSeo(pageSlug)

  if (!seo) return null

  return (
    <Helmet>
      {seo.metaTitle ? <title>{seo.metaTitle}</title> : null}
      {seo.metaDescription ? <meta name="description" content={seo.metaDescription} /> : null}
      {seo.metaKeywords ? <meta name="keywords" content={seo.metaKeywords} /> : null}
      {seo.canonicalUrl ? <link rel="canonical" href={seo.canonicalUrl} /> : null}
      {seo.ogTitle ? <meta property="og:title" content={seo.ogTitle} /> : null}
      {seo.ogDescription ? <meta property="og:description" content={seo.ogDescription} /> : null}
      <meta property="og:type" content="website" />
      {seo.canonicalUrl ? <meta property="og:url" content={seo.canonicalUrl} /> : null}
      {seo.ogImage ? <meta property="og:image" content={seo.ogImage} /> : null}
      <meta name="twitter:card" content="summary_large_image" />
      {seo.twitterTitle ? <meta name="twitter:title" content={seo.twitterTitle} /> : null}
      {seo.twitterDescription ? <meta name="twitter:description" content={seo.twitterDescription} /> : null}
      {seo.twitterImage ? <meta name="twitter:image" content={seo.twitterImage} /> : null}
    </Helmet>
  )
}

export default PageSeo
