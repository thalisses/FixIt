import "./styles/index.css";

export function App() {
  return (
    <div className="min-h-screen page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="FixIt início">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>FixIt</span>
        </a>
        <div className="environment-label">
          <span className="environment-dot" aria-hidden="true" />
          <span>Ambiente de desenvolvimento</span>
        </div>
      </header>

      <main className="main-content">
        <section className="intro" aria-labelledby="page-title">
          <div className="eyebrow">
            <span className="eyebrow-index">01</span>
            <span>Fundação do sistema</span>
          </div>
          <h1 id="page-title">FixIt</h1>
          <p className="intro-copy">Gestão de manutenção patrimonial.</p>
          <div className="intro-rule" />
          <p className="system-status" role="status">
            Frontend inicial em execução.
          </p>
        </section>
      </main>

      <footer className="footer">
        <span>FixIt / Fundação</span>
        <span>Desenvolvimento local</span>
      </footer>
    </div>
  );
}