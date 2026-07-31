import aboutData from './about'
import { experiences } from './experiences'
import { technicalSkills, personalSkills } from './skills'
import { coreTools } from './tools'
import { workflowPatterns, systemCharacteristics } from './workflows'
import { certifications } from './certifications'

export function getStaticProfileContent() {
  return {
    about: aboutData,
    experiences,
    skills: {
      technical: technicalSkills,
      personal: personalSkills,
    },
    tools: coreTools,
    workflowPatterns,
    systemCharacteristics,
    certifications,
  }
}

export default getStaticProfileContent
