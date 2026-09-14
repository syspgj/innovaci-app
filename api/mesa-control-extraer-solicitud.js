<!-- =========================================================
     S5 · PRUEBA DE 15 DÍAS
========================================================== -->

<section id="sf-s5" aria-labelledby="sf-s5-title">
  <style>
    #sf-s5,
    #sf-s5 *,
    #sf-s5 *::before,
    #sf-s5 *::after {
      box-sizing: border-box;
    }

    #sf-s5 {
      --navy: #03202c;
      --navy-light: #073b4d;
      --teal: #00b2b4;
      --teal-light: #55e3df;
      --blue: #29a2dd;
      --white: #ffffff;
      --soft: #bfd0d6;

      position: relative !important;
      left: 50% !important;
      width: 100vw !important;
      max-width: 100vw !important;
      margin: 0 0 0 -50vw !important;
      padding: 62px clamp(22px, 4vw, 62px) !important;
      overflow: hidden;

      background:
        radial-gradient(
          circle at 86% 15%,
          rgba(41, 162, 221, 0.17),
          transparent 29%
        ),
        linear-gradient(135deg, #03202c 0%, #053142 60%, #064454 100%) !important;

      color: var(--white) !important;
      font-family: "Montserrat", Arial, sans-serif !important;
    }

    #sf-s5 .sf-s5-container {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
      gap: clamp(42px, 7vw, 90px);
      align-items: center;

      width: 100% !important;
      max-width: 1240px !important;
      margin: 0 auto !important;
      padding: 0 !important;
    }

    #sf-s5 .sf-s5-eyebrow {
      display: flex;
      align-items: center;
      gap: 10px;

      margin: 0 0 13px !important;
      color: var(--teal-light) !important;
      font-size: 12px !important;
      font-weight: 800 !important;
      line-height: 1.3 !important;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }

    #sf-s5 .sf-s5-eyebrow::before {
      content: "";
      flex: 0 0 29px;
      width: 29px;
      height: 3px;
      border-radius: 999px;
      background: var(--teal);
    }

    #sf-s5 h2,
    #sf-s5 #sf-s5-title {
      max-width: 680px;

      margin: 0 !important;
      padding: 0 !important;

      color: var(--white) !important;
      font-size: clamp(38px, 4.3vw, 58px) !important;
      font-weight: 800 !important;
      line-height: 1.04 !important;
      letter-spacing: -0.045em !important;
      text-wrap: balance;
    }

    #sf-s5 h2 span {
      color: var(--teal-light) !important;
    }

    #sf-s5 .sf-s5-intro {
      max-width: 680px;
      margin: 20px 0 0 !important;

      color: var(--soft) !important;
      font-size: clamp(16px, 1.45vw, 19px) !important;
      font-weight: 500 !important;
      line-height: 1.65 !important;
    }

    #sf-s5 .sf-s5-intro strong {
      color: var(--white) !important;
      font-weight: 800 !important;
    }

    #sf-s5 .sf-s5-options {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 11px;
      margin-top: 23px;
    }

    #sf-s5 .sf-s5-option {
      padding: 17px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 13px;
      background: rgba(255, 255, 255, 0.05);
    }

    #sf-s5 .sf-s5-option span {
      display: block;
      margin-bottom: 6px;

      color: var(--teal-light) !important;
      font-size: 10px !important;
      font-weight: 850 !important;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    #sf-s5 .sf-s5-option strong {
      display: block;
      margin-bottom: 5px;

      color: var(--white) !important;
      font-size: 14px !important;
      font-weight: 800 !important;
      line-height: 1.3 !important;
    }

    #sf-s5 .sf-s5-option p {
      margin: 0 !important;
      color: var(--soft) !important;
      font-size: 11px !important;
      font-weight: 500 !important;
      line-height: 1.5 !important;
    }

    #sf-s5 .sf-s5-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 11px;
      margin-top: 24px;
    }

    #sf-s5 .sf-s5-button {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      gap: 9px;

      min-height: 50px;
      padding: 13px 20px !important;
      border-radius: 9px;

      font-size: 13px !important;
      font-weight: 800 !important;
      line-height: 1.2 !important;
      text-align: center;
      text-decoration: none !important;
      transition: transform 0.2s ease, background 0.2s ease;
    }

    #sf-s5 .sf-s5-button:hover {
      transform: translateY(-2px);
    }

    #sf-s5 .sf-s5-button--primary {
      border: 1px solid var(--teal) !important;
      background: var(--teal) !important;
      color: #01252d !important;
    }

    #sf-s5 .sf-s5-button--primary:hover {
      background: var(--teal-light) !important;
    }

    #sf-s5 .sf-s5-button--secondary {
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      background: transparent !important;
      color: var(--white) !important;
    }

    #sf-s5 .sf-s5-button--secondary:hover {
      background: rgba(255, 255, 255, 0.08) !important;
    }

    #sf-s5 .sf-s5-arrow {
      font-size: 18px !important;
      line-height: 1 !important;
    }

    /* TARJETA 15 DÍAS */

    #sf-s5 .sf-s5-card {
      position: relative;
      overflow: hidden;
      padding: clamp(28px, 4vw, 42px);

      border: 1px solid rgba(85, 227, 223, 0.32);
      border-radius: 22px;
      background:
        linear-gradient(
          145deg,
          rgba(0, 178, 180, 0.17),
          rgba(41, 162, 221, 0.07)
        );
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.23);
    }

    #sf-s5 .sf-s5-card::after {
      content: "15";
      position: absolute;
      right: -10px;
      bottom: -48px;

      color: rgba(85, 227, 223, 0.07) !important;
      font-size: 220px !important;
      font-weight: 900 !important;
      line-height: 1 !important;
    }

    #sf-s5 .sf-s5-days {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: flex-end;
      gap: 11px;
      margin-bottom: 22px;
    }

    #sf-s5 .sf-s5-days strong {
      color: var(--teal-light) !important;
      font-size: clamp(72px, 8vw, 108px) !important;
      font-weight: 850 !important;
      line-height: 0.8 !important;
      letter-spacing: -0.06em !important;
    }

    #sf-s5 .sf-s5-days span {
      padding-bottom: 5px;
      color: var(--white) !important;
      font-size: 17px !important;
      font-weight: 800 !important;
      line-height: 1.1 !important;
      text-transform: uppercase;
    }

    #sf-s5 .sf-s5-card h3 {
      position: relative;
      z-index: 1;

      margin: 0 0 12px !important;
      color: var(--white) !important;
      font-size: clamp(23px, 2.5vw, 32px) !important;
      font-weight: 800 !important;
      line-height: 1.15 !important;
      letter-spacing: -0.025em !important;
    }

    #sf-s5 .sf-s5-card > p {
      position: relative;
      z-index: 1;

      margin: 0 !important;
      color: var(--soft) !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      line-height: 1.65 !important;
    }

    #sf-s5 .sf-s5-details {
      position: relative;
      z-index: 1;

      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 21px;
    }

    #sf-s5 .sf-s5-details span {
      padding: 7px 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.05);

      color: var(--white) !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      line-height: 1.2 !important;
    }

    #sf-s5 .sf-s5-note {
      position: relative;
      z-index: 1;

      margin-top: 17px !important;
      padding-top: 16px !important;
      border-top: 1px solid rgba(255, 255, 255, 0.13);

      color: #a9bdc5 !important;
      font-size: 10px !important;
      font-weight: 500 !important;
      line-height: 1.5 !important;
    }

    @media (max-width: 850px) {
      #sf-s5 {
        padding: 50px 22px !important;
      }

      #sf-s5 .sf-s5-container {
        grid-template-columns: 1fr;
        gap: 34px;
      }

      #sf-s5 .sf-s5-card {
        max-width: 650px;
      }
    }

    @media (max-width: 560px) {
      #sf-s5 {
        padding: 42px 20px !important;
      }

      #sf-s5 h2,
      #sf-s5 #sf-s5-title {
        font-size: 36px !important;
      }

      #sf-s5 .sf-s5-options {
        grid-template-columns: 1fr;
      }

      #sf-s5 .sf-s5-actions {
        flex-direction: column;
      }

      #sf-s5 .sf-s5-button {
        width: 100%;
      }

      #sf-s5 .sf-s5-card {
        padding: 27px 22px;
      }
    }
  </style>

  <div class="sf-s5-container">
    <div class="sf-s5-copy">
      <p class="sf-s5-eyebrow">Aprende utilizando la herramienta</p>

      <h2 id="sf-s5-title">
        Ver cómo funciona no es lo mismo que
        <span>entrar y probarlo.</span>
      </h2>

      <p class="sf-s5-intro">
        Si ya utilizas Siigo Fiscal, podrás seguir los procesos del taller
        directamente desde tu cuenta. Si todavía no lo tienes,
        <strong>podrás activar una prueba por 15 días</strong> para explorar
        la plataforma y poner en práctica lo aprendido.
      </p>

      <div class="sf-s5-options">
        <div class="sf-s5-option">
          <span>Si ya lo utilizas</span>
          <strong>Trabaja desde tu cuenta</strong>
          <p>
            Sigue los procesos y revisiones mostrados durante el taller.
          </p>
        </div>

        <div class="sf-s5-option">
          <span>Si aún no lo tienes</span>
          <strong>Activa la prueba</strong>
          <p>
            Entra a la plataforma y conoce sus herramientas durante 15 días.
          </p>
        </div>
      </div>

      <div class="sf-s5-actions">
        <a class="sf-s5-button sf-s5-button--primary" href="#registro-taller">
          Registrarme al taller
          <span class="sf-s5-arrow" aria-hidden="true">→</span>
        </a>

        <a
          class="sf-s5-button sf-s5-button--secondary"
          href="https://www.innovaci.com.mx/siigo-fiscal"
          target="_blank"
          rel="noopener">
          Conocer la prueba de 15 días
        </a>
      </div>
    </div>

    <aside class="sf-s5-card" aria-label="Prueba de Siigo Fiscal">
      <div class="sf-s5-days">
        <strong>15</strong>
        <span>días<br>de prueba</span>
      </div>

      <h3>Entra, explora y practica.</h3>

      <p>
        Conoce Siigo Fiscal desde dentro y aprovecha mejor el taller siguiendo
        los procesos directamente en la plataforma.
      </p>

      <div class="sf-s5-details">
        <span>Acceso temporal</span>
        <span>Sin tarjeta de crédito</span>
        <span>Activación en línea</span>
      </div>

      <p class="sf-s5-note">
        La activación y disponibilidad de la prueba están sujetas a las
        condiciones vigentes de Siigo.
      </p>
    </aside>
  </div>
</section>
