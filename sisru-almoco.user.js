// ==UserScript==
// @name         SISRU Automação Universal - Almoço (v50)
// @namespace    http://tampermonkey.net/
// @version      50.0
// @description  A versão mais robusta e universal para automação de Almoço no SISRU. Funciona para qualquer usuário, pois localiza elementos pelo texto e estrutura, não por IDs frágeis que mudam constantemente.
// @author       Natan Willian Noronha (com reengenharia para universalidade)
// @match        https://app.unesp.br/sisru-franca/*
// @grant        none
// @license      MIT
// @icon         https://app.unesp.br/favicon.ico
// @run-at       document-idle
// @updateURL    https://github.com/NatanWillianNo/sisru-automatico/raw/main/sisru-almoco-universal.user.js
// @downloadURL  https://github.com/NatanWillianNo/sisru-automatico/raw/main/sisru-almoco-universal.user.js
// @supportURL   https://github.com/NatanWillianNo/sisru-automatico/issues
// @homepageURL  https://github.com/NatanWillianNo/sisru-automatico
// ==/UserScript==

(function () {
    'use strict';

    /**
     * @file SISRU Automação Universal - Almoço, v50.0.
     * @description Esta versão foi reescrita para ser universalmente compatível, eliminando
     *              a dependência de seletores de ID gerados dinamicmente pelo JSF (JavaServer Faces).
     *              Em vez disso, ela localiza os elementos com base em seu conteúdo textual e
     *              estrutura HTML, garantindo maior longevidade e funcionamento para todos os usuários.
     */

    // --- 0. BLINDAGEM DE PRÉ-EXECUÇÃO ---
    // Garante que o script não falhe caso bibliotecas externas como jQuery não carreguem completamente.
    (function () {
        if (typeof window.jQuery !== 'undefined' && !window.jQuery.fn.highlight) {
            console.log("[SISRU-BLINDAGEM] A função jQuery.fn.highlight não existe. Criando 'stub' para evitar erros.");
            window.jQuery.fn.highlight = function () { return this; };
        }
    })();


    // --- 1. CONFIGURAÇÕES GLOBAIS ---
    // Centraliza todos os parâmetros para facilitar a manutenção.
    const CONFIG = {
        MODO_DEBUG: true,
        URL_ATIVACAO: "https://app.unesp.br/sisru-franca/cliente/selecionarFilaPorPeriodoDeAtendimento.do",
        TIPO_REFEICAO_ALVO: "Almoço",
        NOME_SCRIPT: "Almoço Universal",
        ID_PAINEL: "painel-sisru-almoco-universal",

        // Seletores baseados na estrutura HTML, que são mais estáveis que IDs.
        SELETORES: {
            CLOUDFLARE_IFRAME: "iframe[src*='challenges.cloudflare.com/turnstile']",
            PAINEL_DE_REFEICAO: "div.panelPeriodo", // Contêiner de cada opção de refeição (Almoço, Jantar).
            TITULO_DENTRO_DO_PAINEL: "h1",         // Elemento que contém o nome da refeição.
            POPUP_COMPRA_FEITA_MENSAGEM: ".ui-growl-item .ui-growl-title",
        },

        // Textos-chave para encontrar elementos e identificar estados da página.
        FRASES_CHAVE: {
            ERRO_404_PG: "página não encontrada",
            COMPRA_REALIZADA: "você já adquiriu todas as opções possíveis",
            BOTAO_LIBERAR_FILA_TEXTO: "Liberar Fila", // Texto exato no botão final.
            STATUS_FIM_COMPRA: ["aquisição de refeições", "sua posição na fila"],
            CLOUDFLARE_DESAFIO_TEXTO: ["verify you are human", "verificar se é humano"],
            SEM_REFEICOES: "não há refeições disponíveis!",
        },

        // Intervalos de tempo em milissegundos.
        TIMERS_MS: {
            RELOAD_NORMAL: 2000,
            RELOAD_RAPIDO: 1000,
            WATCHDOG: 90000,
            CAPTCHA_TIMEOUT: 120000,
            CAPTCHA_CHECK_INTERVAL: 500,
            CARGA_PAGINA_DELAY: 500,
        },
        version: GM_info.script.version
    };


    // --- 2. ESTADO DA APLICAÇÃO ---
    const STATE = {
        watchdogTimer: null,
        isScriptActive: true,
    };


    // --- 3. UTILITÁRIOS E LOGGER ---
    const Utils = {
        /**
         * Sistema centralizado para exibir mensagens no HUD (painel na tela) e no console.
         */
        Logger: {
            cores: { info: "#00bfff", success: "#2ed573", error: "#ff4757", warn: "#ffa502", action: "#3742fa", wait: "#747d8c", pico: "#ff6348" },

            display: (estado, msg, cor) => {
                const HORA_ATUAL = new Date().toLocaleTimeString("pt-BR");
                let painel = document.getElementById(CONFIG.ID_PAINEL);
                if (!painel) {
                    painel = document.createElement("div");
                    painel.id = CONFIG.ID_PAINEL;
                    Object.assign(painel.style, {
                        position: 'fixed',
                        top: '10px', // Posição no topo para não conflitar com o HUD do Jantar.
                        right: '10px',
                        zIndex: '99999',
                        padding: '15px',
                        borderRadius: '10px',
                        backgroundColor: '#1a1a1a',
                        color: '#fff',
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                        maxWidth: '350px',
                        lineHeight: '1.5em'
                    });
                    document.body.appendChild(painel);
                }
                const periodo = Logic.getPeriodoAtual();
                const corPeriodo = periodo.tipo === 'PICO' ? Utils.Logger.cores.pico : Utils.Logger.cores.wait;

                painel.innerHTML =
                    `<b style="color:${corPeriodo};font-size:12px;display:block;border-bottom:1px solid ${corPeriodo};padding-bottom:5px;margin-bottom:5px;">PERÍODO: ${periodo.tipo} (${periodo.descricao})</b>
                     <b style="color:#fff;font-size:12px;display:block;">[${estado}]</b>
                     <b style="color:${cor};">[${HORA_ATUAL}] ${msg}</b>`;
                painel.style.borderLeft = `5px solid ${cor}`;
                console.log(`[SISRU-${CONFIG.NOME_SCRIPT} | ${HORA_ATUAL} | ${estado}] ${msg}`);
            },

            info: (msg) => Utils.Logger.display("INFO", msg, Utils.Logger.cores.info),
            success: (msg) => Utils.Logger.display("SUCESSO", msg, Utils.Logger.cores.success),
            error: (msg) => Utils.Logger.display("ERRO", msg, Utils.Logger.cores.error),
            warn: (msg) => Utils.Logger.display("AVISO", msg, Utils.Logger.cores.warn),
            action: (msg) => Utils.Logger.display("AÇÃO", msg, Utils.Logger.cores.action),
            wait: (msg, cor) => Utils.Logger.display("AGUARDANDO", msg, cor || Utils.Logger.cores.wait),
            debug: (msg, ...params) => { if (CONFIG.MODO_DEBUG) { console.log(`[SISRU-DEBUG ${CONFIG.NOME_SCRIPT} @ ${new Date().toLocaleTimeString()}] ${msg}`, ...params); } }
        },

        /**
         * Verifica se um elemento está genuinamente visível para o usuário.
         * @param {HTMLElement} element O elemento a ser verificado.
         * @returns {boolean} True se o elemento estiver visível.
         */
        isElementTrulyVisible: (element) => {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        },

        /**
         * Procura um elemento na página que contenha um texto específico. É mais robusto que seletores de ID.
         * @param {string} selector - Seletor CSS para filtrar os elementos (ex: 'button', 'a', 'h1').
         * @param {string} text - O texto a ser procurado dentro do elemento.
         * @returns {HTMLElement|null} O primeiro elemento visível que corresponde, ou null se não encontrar.
         */
        findElementByText: (selector, text) => {
            Utils.Logger.debug(`Procurando por elemento '${selector}' com texto contendo '${text}'...`);
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el.textContent.trim().includes(text) && Utils.isElementTrulyVisible(el)) {
                    Utils.Logger.debug(`Elemento encontrado!`, el);
                    return el;
                }
            }
            Utils.Logger.debug(`Nenhum elemento visível foi encontrado.`);
            return null;
        },
    };


    // --- 4. MÓDULO DE CAPTCHA ---
    const CaptchaHandler = {
        iniciar: () => {
            Utils.Logger.warn("Desafio Cloudflare detectado. Por favor, resolva o CAPTCHA.");
            CaptchaHandler.vigiarResultado(Date.now());
        },
        vigiarResultado: (startTime) => {
            if (!STATE.isScriptActive || Date.now() - startTime > CONFIG.TIMERS_MS.CAPTCHA_TIMEOUT) {
                if (STATE.isScriptActive) {
                    Utils.Logger.error("Tempo para resolver o CAPTCHA esgotou! Recarregando a página.");
                    setTimeout(() => location.reload(), 2000);
                }
                return;
            }
            try {
                const iframe = document.querySelector(CONFIG.SELETORES.CLOUDFLARE_IFRAME);
                const bodyText = document.body.innerText.toLowerCase();
                const captchaResolved = !Utils.isElementTrulyVisible(iframe) &&
                                        !CONFIG.FRASES_CHAVE.CLOUDFLARE_DESAFIO_TEXTO.some(t => bodyText.includes(t));
                if (captchaResolved) {
                    Utils.Logger.success("CAPTCHA validado com sucesso! Retomando automação...");
                    setTimeout(Logic.analisarEAgir, 500);
                    return;
                }
            } catch (e) {
                Utils.Logger.error(`Erro ao verificar CAPTCHA: ${e.message}`);
            }
            setTimeout(() => CaptchaHandler.vigiarResultado(startTime), CONFIG.TIMERS_MS.CAPTCHA_CHECK_INTERVAL);
        },
    };


    // --- 5. LÓGICA DE NEGÓCIO ---
    const Logic = {
        /**
         * Define os horários de pico para acelerar a recarga da página, específicos para o ALMOÇO.
         * @returns {{tipo: 'PICO'|'AGUARDO', descricao: string}}
         */
        getPeriodoAtual: () => {
            const agora = new Date();
            const [d, h, m] = [agora.getDay(), agora.getHours(), agora.getMinutes()]; // Dom=0, Seg=1...
            const MIN_OFFSET = 2;

            // PICO: Reserva Antecipada de Almoço (ex: Seg/Ter às 17h)
            if ((d >= 1 && d <= 3) && (h === 16 && m >= (60 - MIN_OFFSET)) || (h === 17 && m <= MIN_OFFSET)) {
                return { tipo: 'PICO', descricao: `Reserva Antecipada (${PICO_HOUR_RESERVA}h)` };
            }
            // PICO: Abertura Geral do Almoço no dia (09h45)
            if (h === 9 && m >= 43 && m <= 47) {
                return { tipo: 'PICO', descricao: 'Abertura Almoço (09h45)' };
            }
             // PICO: Abertura Geral do Almoço no dia (11h00)
            if ((h === 10 && m >= 58) || (h === 11 && m <= 2)) {
                 return { tipo: 'PICO', descricao: 'Abertura 11h' };
            }
            // PICO: "Xepa" do Almoço (12h43)
            if (h === 12 && m >= 43 && m <= 59) {
                return { tipo: 'PICO', descricao: 'Xepa Almoço (12h43)' };
            }
            return { tipo: 'AGUARDO', descricao: 'Fora do horário de pico' };
        },

        /**
         * Função central que analisa a página e decide a próxima ação.
         */
        analisarEAgir: () => {
            if (!STATE.isScriptActive) return;

            // Reinicia o watchdog para evitar recargas indevidas.
            clearTimeout(STATE.watchdogTimer);
            STATE.watchdogTimer = setTimeout(() => {
                Utils.Logger.error("Watchdog: Script parece travado. Forçando recarga...");
                location.href = CONFIG.URL_ATIVACAO;
            }, CONFIG.TIMERS_MS.WATCHDOG);

            const bodyText = document.body.innerText.toLowerCase();
            Utils.Logger.info("Analisando estado da página...");

            // --- ESTADO 1: SUCESSO OU FINALIZAÇÃO ---
            const popupTitle = document.querySelector(CONFIG.SELETORES.POPUP_COMPRA_FEITA_MENSAGEM);
            if (popupTitle && Utils.isElementTrulyVisible(popupTitle) && popupTitle.textContent.toLowerCase().includes(CONFIG.FRASES_CHAVE.COMPRA_REALIZADA)) {
                Utils.Logger.success("Popup de 'compra realizada' detectado!");
                const botaoLiberar = Utils.findElementByText('button', CONFIG.FRASES_CHAVE.BOTAO_LIBERAR_FILA_TEXTO);
                if (botaoLiberar) {
                    Utils.Logger.action("Clicando no botão 'Liberar Fila'...");
                    botaoLiberar.click();
                    Utils.Logger.success("✅ Fila liberada! Automação concluída com sucesso.");
                } else {
                    Utils.Logger.error("Botão 'Liberar Fila' não encontrado após a compra!");
                }
                clearTimeout(STATE.watchdogTimer);
                STATE.isScriptActive = false;
                return;
            }

            if (CONFIG.FRASES_CHAVE.STATUS_FIM_COMPRA.some(s => bodyText.includes(s))) {
                Utils.Logger.success("✅ Posição na fila garantida ou aquisição já feita! Automação concluída.");
                clearTimeout(STATE.watchdogTimer);
                STATE.isScriptActive = false;
                return;
            }

            // --- ESTADO 2: ERROS E OBSTÁCULOS ---
            if (bodyText.includes(CONFIG.FRASES_CHAVE.ERRO_404_PG)) {
                Utils.Logger.error("Página de erro 404 detectada. Retornando à página inicial em 3s...");
                setTimeout(() => { location.href = CONFIG.URL_ATIVACAO; }, 3000);
                return;
            }

            if (document.querySelector(CONFIG.SELETORES.CLOUDFLARE_IFRAME) || CONFIG.FRASES_CHAVE.CLOUDFLARE_DESAFIO_TEXTO.some(t => bodyText.includes(t))) {
                CaptchaHandler.iniciar();
                return; // Pausa a análise até o CAPTCHA ser resolvido.
            }

            // --- ESTADO 3: AÇÃO PRINCIPAL (MÉTODO UNIVERSAL) ---
            Utils.Logger.debug(`Procurando pelo painel de refeição '${CONFIG.TIPO_REFEICAO_ALVO}'...`);
            const paineisDeRefeicao = document.querySelectorAll(CONFIG.SELETORES.PAINEL_DE_REFEICAO);
            for (const painel of paineisDeRefeicao) {
                const titulo = painel.querySelector(CONFIG.SELETORES.TITULO_DENTRO_DO_PAINEL);
                if (titulo && titulo.textContent.trim().includes(CONFIG.TIPO_REFEICAO_ALVO) && Utils.isElementTrulyVisible(painel)) {
                    Utils.Logger.action(`✔️ Painel '${CONFIG.TIPO_REFEICAO_ALVO}' encontrado! Clicando...`);
                    // O elemento clicável é o link `<a>` que envolve o painel.
                    const linkDoPainel = painel.closest('a');
                    if (linkDoPainel) {
                        linkDoPainel.click();
                    } else {
                        Utils.Logger.error("Painel encontrado, mas o link clicável (tag <a>) ao redor dele não foi encontrado!");
                    }
                    return; // Ação executada, aguarda a próxima página carregar.
                }
            }

            // --- ESTADO 4: ESPERA E RECARGA ---
            const periodoAtual = Logic.getPeriodoAtual();
            const tempoRecarga = (periodoAtual.tipo === "PICO") ? CONFIG.TIMERS_MS.RELOAD_RAPIDO : CONFIG.TIMERS_MS.RELOAD_NORMAL;
            const corEspera = (periodoAtual.tipo === "PICO") ? Utils.Logger.cores.pico : Utils.Logger.cores.wait;

            let msg = "Aguardando opção de refeição ficar disponível.";
            if (bodyText.includes(CONFIG.FRASES_CHAVE.SEM_REFEICOES)) {
                msg = "Nenhuma refeição disponível no momento.";
            }

            Utils.Logger.wait(`⏳ ${msg} Recarregando em ${tempoRecarga / 1000}s...`, corEspera);
            setTimeout(() => location.reload(), tempoRecarga);
        },
    };


    // --- 6. INICIALIZAÇÃO DO SCRIPT ---
    const Main = {
        init: () => {
            if (window.location.href.startsWith(CONFIG.URL_ATIVACAO.split('?')[0])) {
                Utils.Logger.info(`Script ${CONFIG.NOME_SCRIPT} v${CONFIG.version} iniciado.`);
                setTimeout(Logic.analisarEAgir, CONFIG.TIMERS_MS.CARGA_PAGINA_DELAY);
            } else {
                Utils.Logger.wait("Automação inativa nesta página.");
            }
        },
    };

    window.addEventListener("load", Main.init);
})();
