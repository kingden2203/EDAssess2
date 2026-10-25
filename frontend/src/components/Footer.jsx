// 📁 frontend/src/components/Footer.jsx
import '../styles/Footer.css';

const links = ['About', 'Privacy', 'Contact'];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">Edu<span>Assess</span> · PRMSU IBA</div>
        <div className="footer-note">
          © 2026 College of Teacher Education and College of Industrial Technology — President Ramon Magsaysay State University, Iba Main Campus
        </div>
      </div>
    </footer>
  );
}