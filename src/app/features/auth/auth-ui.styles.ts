export const AUTH_UI_STYLES = `
  :host {
    display: block;
    min-height: 100vh;
    background: #08111f;
    color: #0a1628;
  }

  .auth-page {
    min-height: 100vh;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    background:
      radial-gradient(circle at 18% 16%, rgba(20,184,166,.24), transparent 28%),
      radial-gradient(circle at 78% 18%, rgba(245,184,65,.18), transparent 28%),
      linear-gradient(135deg, #08111f 0%, #102743 52%, #0c1a2d 100%);
    padding: clamp(18px, 4vw, 42px);
  }

  .auth-grid {
    width: min(1120px, 100%);
    margin: auto;
    display: grid;
    grid-template-columns: minmax(0, .95fr) minmax(360px, 440px);
    gap: clamp(24px, 5vw, 64px);
    align-items: center;
  }

  .auth-story {
    color: #fff;
    min-width: 0;
  }

  .auth-brand {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 34px;
    text-decoration: none;
    color: #fff;
  }

  .auth-brand-mark {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: #f5b841;
    color: #07101e;
    font-weight: 900;
    font-size: 21px;
    box-shadow: 0 14px 32px rgba(245,184,65,.28);
  }

  .auth-brand-name {
    font-weight: 900;
    letter-spacing: .09em;
    font-size: .9rem;
  }

  .auth-brand-sub {
    color: rgba(255,255,255,.68);
    font-size: .78rem;
    margin-top: 2px;
  }

  .auth-eyebrow {
    display: inline-flex;
    width: fit-content;
    border: 1px solid rgba(255,255,255,.16);
    background: rgba(255,255,255,.08);
    color: #f5d27a;
    border-radius: 999px;
    padding: 7px 11px;
    font-size: .72rem;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
    margin: 0 0 16px;
  }

  .auth-story h1 {
    margin: 0;
    max-width: 720px;
    font-size: clamp(2.2rem, 5vw, 4.7rem);
    line-height: .98;
    letter-spacing: 0;
  }

  .auth-story p {
    max-width: 620px;
    margin: 18px 0 0;
    color: rgba(255,255,255,.76);
    line-height: 1.72;
    font-size: 1rem;
  }

  .auth-proof {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 30px;
    max-width: 660px;
  }

  .auth-proof div {
    border: 1px solid rgba(255,255,255,.13);
    background: rgba(255,255,255,.07);
    border-radius: 14px;
    padding: 14px;
    min-height: 88px;
  }

  .auth-proof strong {
    display: block;
    color: #fff;
    font-size: .92rem;
  }

  .auth-proof span {
    display: block;
    color: rgba(255,255,255,.62);
    font-size: .78rem;
    line-height: 1.45;
    margin-top: 5px;
  }

  .auth-panel {
    background: rgba(255,255,255,.96);
    border: 1px solid rgba(255,255,255,.44);
    border-radius: 22px;
    padding: clamp(24px, 4vw, 34px);
    box-shadow: 0 32px 80px rgba(0,0,0,.34);
  }

  .panel-label {
    margin: 0 0 8px;
    color: #1e63d6;
    font-size: .76rem;
    font-weight: 900;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .auth-title {
    margin: 0;
    color: #09182b;
    font-size: clamp(1.55rem, 4vw, 2.05rem);
    line-height: 1.12;
    letter-spacing: 0;
  }

  .auth-sub {
    color: #536276;
    line-height: 1.58;
    margin: 10px 0 22px;
    font-size: .93rem;
  }

  .auth-field {
    width: 100%;
    margin-bottom: 4px;
  }

  .form-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 2px 0 14px;
  }

  .mini-note {
    color: #68768a;
    font-size: .78rem;
    line-height: 1.4;
  }

  .auth-error,
  .auth-success {
    font-size: .84rem;
    line-height: 1.45;
    margin: 4px 0 14px;
    padding: 11px 12px;
    border-radius: 12px;
  }

  .auth-error {
    color: #991b1b;
    background: #fee2e2;
    border: 1px solid #fecaca;
  }

  .auth-success {
    color: #14532d;
    background: #dcfce7;
    border: 1px solid #bbf7d0;
  }

  .auth-submit {
    width: 100%;
    min-height: 48px;
    border: none;
    border-radius: 14px;
    background: #f5b841;
    color: #07101e;
    font-weight: 900;
    font-size: .94rem;
    cursor: pointer;
    margin-top: 8px;
    box-shadow: 0 14px 30px rgba(245,184,65,.32);
    transition: background .18s ease, transform .18s ease, box-shadow .18s ease;
  }

  .auth-submit:hover:not(:disabled) {
    background: #f0a820;
    transform: translateY(-1px);
    box-shadow: 0 18px 38px rgba(245,184,65,.42);
  }

  .auth-submit:disabled {
    opacity: .58;
    cursor: not-allowed;
    box-shadow: none;
  }

  .auth-links {
    display: grid;
    gap: 8px;
    margin-top: 18px;
    text-align: center;
  }

  .auth-link {
    color: #1e63d6;
    font-weight: 800;
    font-size: .86rem;
    text-decoration: none;
  }

  .auth-link:hover {
    color: #0a1628;
  }

  .auth-link-muted {
    color: #6b7d94;
    font-weight: 700;
  }

  .security-note {
    margin: 20px 0 0;
    color: #64748b;
    font-size: .77rem;
    line-height: 1.5;
    border-top: 1px solid rgba(10,22,40,.08);
    padding-top: 14px;
  }

  @media (max-width: 920px) {
    .auth-page {
      padding: 18px;
      align-items: start;
    }

    .auth-grid {
      grid-template-columns: 1fr;
      gap: 22px;
    }

    .auth-story h1 {
      max-width: 680px;
    }

    .auth-proof {
      grid-template-columns: 1fr;
      margin-top: 20px;
    }
  }

  @media (max-width: 560px) {
    .auth-page {
      padding: 12px;
    }

    .auth-brand {
      margin-bottom: 22px;
    }

    .auth-story p {
      font-size: .94rem;
    }

    .auth-panel {
      border-radius: 18px;
      padding: 22px 18px;
    }

    .form-row {
      align-items: flex-start;
      flex-direction: column;
    }
  }
`;
