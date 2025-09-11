// ==UserScript==
// @name         SISRU Automação - Almoço
// @namespace    http://tampermonkey.net/
// @version      39.0
// @description  Automação para aquisição de Almoço no SISRU
// @author       Natan Willian Noronha
// @match        https://app.unesp.br/sisru-franca/*
// @grant        none
// @license      MIT
// @icon         https://app.unesp.br/favicon.ico
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/seu-usuario/repositorio/main/sisru-almoco.user.js
// @downloadURL  https://raw.githubusercontent.com/seu-usuario/repositorio/main/sisru-almoco.user.js
// @supportURL   https://github.com/seu-usuario/repositorio/issues
// @homepageURL  https://github.com/seu-usuario/repositorio
// ==/UserScript==

(function () {
    'use strict';

    /**
     * @file Script de automação SISRU (Almoço), v39.0.
     */

    // =========================================================================
    // 🛡️ 0. BLINDAGEM DE PRÉ-EXECUÇÃO
    // =========================================================================
    (function () {
        if (typeof window.jQuery !== 'undefined' && !window.jQuery.fn.highlight) {
            console.log("[SISRU-BLINDAGEM] A função jQuery.fn.highlight não existe. Criando uma versão fantasma para evitar erros.");
            window.jQuery.fn.highlight = function () { return this; };
        }
    })();

    // =========================================================================
    // ⚙️ 1. CONFIGURAÇÕES
    // =========================================================================

    const CONFIG = {
        MODO_DEBUG: true,
        URL_ATIVACAO: "https://app.unesp.br/sisru-franca/cliente/selecionarFilaPorPeriodoDeAtendimento.do",
        TIPO_REFEICAO_ALVO: "Almoço", // Modificado para Almoço
        NOME_SCRIPT: "Almoço", // Modificado para Almoço
        ID_PAINEL: "painel-sisru-almoco", // ID único para o painel do Almoço

        SELETORES: {
            CLOUDFLARE_IFRAME: "iframe[src*='challenges.cloudflare.com/turnstile']",
            CLOUDFLARE_SUCCESS_ICON: '#success-i',
            BOTAO_SELECIONAR_FILA: "#form\\:j_idt24",
            PAINEL_SELECIONAR_REFEICAO: "div.panelPeriodo h1",
            POPUP_COMPRA_FEITA_MENSAGEM: ".ui-growl-item .ui-growl-title",
            BOTAO_LIBERAR_FILA: "#form\\:j_idt67",
        },
        FRASES_CHAVE: {
            ERRO_404_PG: "página não encontrada",
            COMPRA_REALIZADA: "você já adquiriu todas as opções possíveis",
            STATUS_FIM_COMPRA: ["aquisição de refeições", "sua posição na fila"],
            CLOUDFLARE_ERROR: ["having trouble", "tendo problemas"],
            CLOUDFLARE_DESAFIO_TEXTO: ["verify you are human", "verificar se é humano", "realize a validação do captcha"],
            SEM_REFEICOES: "não há refeições disponíveis!",
        },
        TIMERS_MS: {
            RELOAD_NORMAL: 2000,
            RELOAD_RAPIDO: 1500,
            WATCHDOG: 90000,
            CAPTCHA_TIMEOUT: 120000,
            CAPTCHA_CHECK_INTERVAL: 500,
            CARGA_PAGINA_DELAY: 500,
        },
    };

    // =========================================================================
    // 🌐 2. ESTADO DA APLICAÇÃO
    // =========================================================================
    const STATE = {
        watchdogTimer: null,
        isScriptActive: true,
    };

    // =========================================================================
    // 🛠️ 3. UTILITÁRIOS GLOBAIS
    // =========================================================================
    const Utils = {
        log: (message, ...optionalParams) => {
            if (CONFIG.MODO_DEBUG) {
                console.log(`[SISRU-DEBUG ${CONFIG.NOME_SCRIPT} @ ${new Date().toLocaleTimeString()}] ${message}`, ...optionalParams);
            }
        },
        mostrarMensagem: (estado, msg, cor) => {
            const HORA_ATUAL = new Date().toLocaleTimeString("pt-BR");
            let painel = document.getElementById(CONFIG.ID_PAINEL);
            if (!painel) {
                painel = document.createElement("div"); painel.id = CONFIG.ID_PAINEL;
                Object.assign(painel.style, {
                    // HUD posicionado no canto superior esquerdo
                    position: 'fixed', top: '10px', right: '10px', zIndex: '99999', padding: '15px', borderRadius: '10px',
                    backgroundColor: '#1a1a1a', color: '#fff', fontSize: '14px', fontFamily: 'monospace',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)', maxWidth: '340px', lineHeight: '1.5em'
                }); document.body.appendChild(painel);
            }
            const periodo = Logic.getPeriodoAtual();
            const corPeriodo = periodo.tipo === 'PICO' ? '#ff6348' : '#747d8c';
            painel.innerHTML =
                `<b style="color:${corPeriodo};font-size:12px;display:block;">PERÍODO: ${periodo.tipo} (${periodo.descricao})</b>
                 <b style="color:#fff;font-size:12px;display:block;margin-top:5px;">[${estado}]</b>
                 <b style="color:${cor};">[${HORA_ATUAL}] ${msg}</b>`;
            painel.style.borderLeft = `5px solid ${cor}`;
            console.log(`[SISRU-${CONFIG.NOME_SCRIPT}] ${msg}`);
        },
        isElementTrulyVisible: (element) => {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) return false;
            const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
        },
    };

    // =========================================================================
    // 🔐 4. MÓDULO DE CAPTCHA
    // =========================================================================
    const CaptchaHandler = {
        iniciar: () => {
            Utils.mostrarMensagem("CAPTCHA", `Aguardando validação...`, "#ffa502");
            CaptchaHandler.vigiarResultado(Date.now());
        },
        vigiarResultado: (startTime) => {
            if (!STATE.isScriptActive || Date.now() - startTime > CONFIG.TIMERS_MS.CAPTCHA_TIMEOUT) {
                if (STATE.isScriptActive) Utils.mostrarMensagem("WATCHDOG", "❌ Timeout no CAPTCHA. Recarregando...", "#ff4757");
                if (STATE.isScriptActive) location.reload();
                return;
            }
            try {
                const iframe = document.querySelector(CONFIG.SELETORES.CLOUDFLARE_IFRAME);
                if (iframe) {
                    const successIcon = iframe.contentDocument.querySelector(CONFIG.SELETORES.CLOUDFLARE_SUCCESS_ICON);
                    if (Utils.isElementTrulyVisible(successIcon)) {
                        Utils.mostrarMensagem("CAPTCHA", `✔️ Validado com sucesso! Prosseguindo...`, "#2ed573");
                        setTimeout(Logic.analisarEAgir, 500); // Pequena pausa pós-captcha
                        return;
                    }
                }
            } catch (e) { /* Ignora erros de cross-origin, a vigilância continua */ }

            setTimeout(() => CaptchaHandler.vigiarResultado(startTime), CONFIG.TIMERS_MS.CAPTCHA_CHECK_INTERVAL);
        },
    };

    // =========================================================================
    // 🧠 5. LÓGICA DE NEGÓCIO E ESTADOS
    // =========================================================================
    const Logic = {
        // Lógica de horários de pico adaptada para o Almoço
        getPeriodoAtual: () => {
            const agora = new Date(); const [h, m] = [agora.getHours(), agora.getMinutes()];
            if ((h === 9 && m >= 43 && m <= 47)) return { tipo: 'PICO', descricao: 'Abertura 9h45' };
            if ((h === 10 && m >= 58) || (h === 11 && m <= 2)) return { tipo: 'PICO', descricao: 'Abertura 11h' };
            if ((h === 12 && m >= 43 && m <= 59)) return { tipo: 'PICO', descricao: 'Xepa 12h43' }; // Ajustado para ser mais abrangente
            return { tipo: 'AGUARDO', descricao: 'Fora do pico' };
        },
        analisarEAgir: () => {
            if (!STATE.isScriptActive) return;

            clearTimeout(STATE.watchdogTimer);
            STATE.watchdogTimer = setTimeout(() => {
                Utils.mostrarMensagem("WATCHDOG", "Script travado. Reiniciando...", "#ff4757");
                location.href = CONFIG.URL_ATIVACAO;
            }, CONFIG.TIMERS_MS.WATCHDOG);

            // ================================================================
            // ETAPA 1: VERIFICAR ESTADOS FINAIS (OBJETIVO ATINGIDO OU ERRO)
            // Prioridade máxima para a condição de sucesso principal.
            // ================================================================
            const popupTitle = document.querySelector(CONFIG.SELETORES.POPUP_COMPRA_FEITA_MENSAGEM);
            if (popupTitle && Utils.isElementTrulyVisible(popupTitle) && popupTitle.textContent.toLowerCase().includes(CONFIG.FRASES_CHAVE.COMPRA_REALIZADA)) {
                Utils.mostrarMensagem("OBJETIVO ATINGIDO", "Popup encontrado! Clicando para liberar a fila...", "#2ed573");
                const botaoLiberar = document.querySelector(CONFIG.SELETORES.BOTAO_LIBERAR_FILA);
                if (botaoLiberar) {
                    botaoLiberar.click();
                    Utils.mostrarMensagem("FINALIZADO", "✅ Vaga liberada! Automação concluída.", "#00bfff");
                } else {
                    Utils.mostrarMensagem("ERRO CRÍTICO", "Popup encontrado, mas o botão 'Liberar Fila' não está presente!", "#ff4757");
                }
                clearTimeout(STATE.watchdogTimer);
                STATE.isScriptActive = false; // Finaliza o script definitivamente
                return;
            }

            const bodyText = document.body.innerText.toLowerCase();
            if (bodyText.includes(CONFIG.FRASES_CHAVE.ERRO_404_PG)) {
                Utils.mostrarMensagem("ERRO", "Página não encontrada (404). Retornando...", "#ff4757");
                setTimeout(() => { location.href = CONFIG.URL_ATIVACAO; }, 3000);
                return;
            }
            if (CONFIG.FRASES_CHAVE.STATUS_FIM_COMPRA.some(s => bodyText.includes(s))) {
                Utils.mostrarMensagem("NA FILA", "✅ Sucesso! Posição na fila garantida.", "#2ed573");
                clearTimeout(STATE.watchdogTimer); STATE.isScriptActive = false;
                return;
            }

            // ================================================================
            // ETAPA 2: VERIFICAR AÇÕES INTERATIVAS NECESSÁRIAS
            // ================================================================
            if (document.querySelector(CONFIG.SELETORES.CLOUDFLARE_IFRAME) || CONFIG.FRASES_CHAVE.CLOUDFLARE_DESAFIO_TEXTO.some(t => bodyText.includes(t))) {
                CaptchaHandler.iniciar(); return;
            }
            const botaoFila = document.querySelector(CONFIG.SELETORES.BOTAO_SELECIONAR_FILA);
            if (botaoFila) {
                Utils.mostrarMensagem("AÇÃO", "▶️ Clicando para selecionar a fila...", "#3742fa");
                botaoFila.click(); return;
            }
            const painelAlvo = Array.from(document.querySelectorAll(CONFIG.SELETORES.PAINEL_SELECIONAR_REFEICAO)).find(el => el.textContent.includes(CONFIG.TIPO_REFEICAO_ALVO));
            if (painelAlvo && Utils.isElementTrulyVisible(painelAlvo)) {
                Utils.mostrarMensagem("AÇÃO", `🍽️ Clicando no painel '${CONFIG.TIPO_REFEICAO_ALVO}'...`, "#3742fa");
                painelAlvo.parentElement.click(); return;
            }

            // ================================================================
            // ETAPA 3: ESTADOS DE ESPERA (RECARREGAR OU REDIRECIONAR)
            // ================================================================
            const tempoRecarga = (Logic.getPeriodoAtual().tipo === "PICO") ? CONFIG.TIMERS_MS.RELOAD_RAPIDO : CONFIG.TIMERS_MS.RELOAD_NORMAL;
            if (document.querySelector(CONFIG.SELETORES.PAINEL_SELECIONAR_REFEICAO)) { // Se painéis de refeição existem, mas não o alvo
                Utils.mostrarMensagem("AGUARDANDO", `⚠️ Refeição alvo não encontrada. Voltando para a fila...`, "#ffc048");
                setTimeout(() => { location.href = CONFIG.URL_ATIVACAO; }, tempoRecarga);
            } else {
                const cor = (Logic.getPeriodoAtual().tipo === "PICO") ? "#ff6348" : "#747d8c";
                const msg = bodyText.includes(CONFIG.FRASES_CHAVE.SEM_REFEICOES) ? "Sem refeições disponíveis." : "Página inicial.";
                Utils.mostrarMensagem("AGUARDANDO", `⏳ ${msg} Recarregando em ${tempoRecarga / 1000}s...`, cor);
                setTimeout(() => location.reload(), tempoRecarga);
            }
        },
    };

    // =========================================================================
    // 🚀 6. INICIALIZAÇÃO
    // =========================================================================
    const Main = {
        init: () => {
            if (window.location.href.startsWith(CONFIG.URL_ATIVACAO.split('?')[0])) {
                Utils.mostrarMensagem("INICIALIZANDO", `Script ${CONFIG.TIPO_REFEICAO_ALVO} v39.0 INICIADO!`, "#00bfff");
                setTimeout(Logic.analisarEAgir, CONFIG.TIMERS_MS.CARGA_PAGINA_DELAY);
            } else {
                Utils.mostrarMensagem("INATIVO", "Automação pausada nesta página.", "#747d8c");
            }
        },
    };

    window.addEventListener("load", Main.init);
})();
