import { Code2, Cpu, Database, Network, Robot, Server } from '../../components/icons/icons'

const FIELD_ICONS = [Code2, Database, Network, Cpu, Server, Robot]

function AdminVectorField({ tone = 'light' }) {
  return (
    <div className={`admin-vector-field admin-vector-field--${tone}`} aria-hidden="true">
      <span className="admin-vector-field__orbit admin-vector-field__orbit--one" />
      <span className="admin-vector-field__orbit admin-vector-field__orbit--two" />
      <span className="admin-vector-field__path admin-vector-field__path--one" />
      <span className="admin-vector-field__path admin-vector-field__path--two" />
      {FIELD_ICONS.map((Icon, index) => (
        <span key={index} className={`admin-vector-field__icon admin-vector-field__icon--${index + 1}`}>
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </span>
      ))}
    </div>
  )
}

export default AdminVectorField
