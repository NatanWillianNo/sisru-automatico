// ==UserScript==
// @name         SISRU Automação - Almoço
// @namespace    http://tampermonkey.net/
// @version      39.5
// @description  Automação para aquisição de Almoço no SISRU, com tempo de atualização variável e detecção de horários de pico.
// @author       Natan Willian Noronha (com modificações)
// @match        https://app.unesp.br/sisru-franca/*
// @grant        none
// @license      MIT
// @icon         https://app.unesp.br/favicon.ico
// @run-at       document-idle
// @updateURL    https://github.com/NatanWillianNo/sisru-automatico/raw/main/sisru-almoco.user.js
// @downloadURL  https://github.com/NatanWillianNo/sisru-automatico/raw/main/sisru-almoco.user.js
// @supportURL   https://github.com/NatanWillianNo/sisru-automatico/issues
// @homepageURL  https://github.com/NatanWillianNo/sisru-automatico
// ==/UserScript==

(function () {
    'use strict';

    /**
     * @file SISRU Automação - Almoço, v39.5.
     * @description Este script automatiza o processo de aquisição de refeições para o almoço no sistema SISRU da UNESP.
     *              Ele adapta o tempo de recarga da página com base em horários de pico definidos (por exemplo, para reservas antecipadas e "xepa"),
     *              detecta e tenta resolver desafios do Cloudflare (captcha) e finaliza o processo ao confirmar a aquisição.
     *              Incorpora blindagem, utilities, módulo de captcha, lógica de negócios e um fluxo de inicialização robusto.
     */

    // =========================================================================
    // 🛡️ 0. BLINDAGEM DE PRÉ-EXECUÇÃO
    // Garante que o ambiente tenha as funções jQuery esperadas, criando "stubs" se ausentes.
    // Isso evita erros em caso de injeção parcial ou scripts conflitantes.
    // =========================================================================
    (function () {
        if (typeof window.jQuery !== 'undefined' && !window.jQuery.fn.highlight) {
            console.log("[SISRU-BLINDAGEM] A função jQuery.fn.highlight não existe. Criando uma versão fantasma para evitar erros.");
            // Criar uma função no-op (no operation) para .highlight se ela não existir
            window.jQuery.fn.highlight = function () { return this; };
        }
    })();

    // =========================================================================
    // ⚙️ 1. CONFIGURAÇÕES GLOBAIS DO SCRIPT
    // Contém todas as constantes e parâmetros configuráveis, facilitando a manutenção.
    // =========================================================================

    const CONFIG = {
        MODO_DEBUG: true, // Define se mensagens de debug serão exibidas no console
        URL_ATIVACAO: "https://app.unesp.br/sisru-franca/cliente/selecionarFilaPorPeriodoDeAtendimento.do",
        TIPO_REFEICAO_ALVO: "Almoço",
        NOME_SCRIPT: "Almoço",
        ID_PAINEL: "painel-sisru-almoco", // ID do painel flutuante de mensagens do script

        SELETORES: {
            // Seletores para elementos específicos no HTML
            CLOUDFLARE_IFRAME: "iframe[src*='challenges.cloudflare.com/turnstile']",
            CLOUDFLARE_SUCCESS_ICON: '#success-i', // Ícone de sucesso dentro do iframe do Cloudflare (raro de acessar cross-origin)
            BOTAO_SELECIONAR_ALMOCO: "#form\\:j_idt26\\:0\\:j_idt27", // Seletor do botão específico para "Almoço"
            PAINEL_SELECIONAR_REFEICAO: "div.panelPeriodo h1", // Seletor geral para títulos de painéis de período
            POPUP_COMPRA_FEITA_MENSAGEM: ".ui-growl-item .ui-growl-title", // Seletor do título do popup de notificação de compra
            BOTAO_LIBERAR_FILA: "#form\\:j_idt67", // Seletor do botão "Liberar Fila" após a compra
        },
        FRASES_CHAVE: {
            // Textos no corpo da página para identificar estados ou erros
            ERRO_404_PG: "página não encontrada",
            COMPRA_REALIZADA: "você já adquiriu todas as opções possíveis",
            STATUS_FIM_COMPRA: ["aquisição de refeições", "sua posição na fila"], // Indica que o objetivo foi atingido
            CLOUDFLARE_DESAFIO_TEXTO: ["verify you are human", "verificar se é humano", "realize a validação do captcha"], // Textos que indicam a presença do captcha Cloudflare
            SEM_REFEICOES: "não há refeições disponíveis!",
        },
        TIMERS_MS: {
            // Tempos em milissegundos para operações e recargas
            RELOAD_NORMAL: 2000, // 2 segundos (recarga padrão)
            RELOAD_RAPIDO: 1000, // 1 segundo (recarga em períodos de pico)
            WATCHDOG: 90000, // 90 segundos para o watchdog detectar script travado
            CAPTCHA_TIMEOUT: 120000, // 2 minutos para resolver o captcha
            CAPTCHA_CHECK_INTERVAL: 500, // Intervalo de 0.5 segundo para checar o status do captcha
            CARGA_PAGINA_DELAY: 500, // Atraso inicial para permitir que a página carregue completamente
        },
        version: GM_info.script.version // Obtém a versão do Tampermonkey diretamente do cabeçalho do script
    };

    // =========================================================================
    // 🌐 2. ESTADO DA APLICAÇÃO
    // Contém variáveis que representam o estado atual do script.
    // =========================================================================
    const STATE = {
        watchdogTimer: null, // Timer para detectar se o script está travado
        isScriptActive: true, // Flag para controlar a execução principal do script
    };

    // =========================================================================
    // 🛠️ 3. UTILITÁRIOS GLOBAIS
    // Funções auxiliares para log, exibição de mensagens e validação de visibilidade.
    // =========================================================================
    const Utils = {
        /**
         * Registra mensagens no console em modo debug.
         * @param {string} message - A mensagem a ser registrada.
         * @param {...any} optionalParams - Parâmetros adicionais para o console.log.
         */
        log: (message, ...optionalParams) => {
            if (CONFIG.MODO_DEBUG) {
                console.log(`[SISRU-DEBUG ${CONFIG.NOME_SCRIPT} @ ${new Date().toLocaleTimeString()}] ${message}`, ...optionalParams);
            }
        },

        /**
         * Exibe uma mensagem em um painel flutuante na tela, atualizando seu conteúdo e estilo.
         * @param {string} estado - O estado atual do script (ex: "INICIALIZANDO", "AGUARDANDO", "PICO").
         * @param {string} msg - A mensagem detalhada a ser exibida.
         * @param {string} cor - A cor do texto da mensagem e da borda lateral do painel (ex: "#00bfff").
         */
        mostrarMensagem: (estado, msg, cor) => {
            const HORA_ATUAL = new Date().toLocaleTimeString("pt-BR");
            let painel = document.getElementById(CONFIG.ID_PAINEL);
            if (!painel) {
                painel = document.createElement("div");
                painel.id = CONFIG.ID_PAINEL;
                // Aplica estilos CSS para posicionamento e aparência do painel
                Object.assign(painel.style, {
                    position: 'fixed', top: '10px', right: '10px', zIndex: '99999', padding: '15px', borderRadius: '10px',
                    backgroundColor: '#1a1a1a', color: '#fff', fontSize: '14px', fontFamily: 'monospace',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)', maxWidth: '340px', lineHeight: '1.5em'
                });
                document.body.appendChild(painel);
            }
            // Determina o tipo de período para coloração do status
            const periodo = Logic.getPeriodoAtual();
            const corPeriodo = periodo.tipo === 'PICO' ? '#ff6348' : '#747d8c'; // Vermelho para pico, cinza para aguardo
            painel.innerHTML =
                `<b style="color:${corPeriodo};font-size:12px;display:block;">PERÍODO: ${periodo.tipo} (${periodo.descricao})</b>
                 <b style="color:#fff;font-size:12px;display:block;margin-top:5px;">[${estado}]</b>
                 <b style="color:${cor};">[${HORA_ATUAL}] ${msg}</b>`;
            painel.style.borderLeft = `5px solid ${cor}`; // Borda lateral colorida para destaque
            console.log(`[SISRU-${CONFIG.NOME_SCRIPT}] ${msg}`); // Também registra no console
        },

        /**
         * Verifica se um elemento está visível e tem dimensões no DOM.
         * Considera 'display: none', 'visibility: hidden' e 'opacity < 0.1'.
         * @param {HTMLElement} element - O elemento a ser verificado.
         * @returns {boolean} - True se o elemento estiver visível, False caso contrário.
         */
        isElementTrulyVisible: (element) => {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        },
    };

    // =========================================================================
    // 🔐 4. MÓDULO DE CAPTCHA
    // Gerencia a detecção e o aguardo pela resolução do desafio Cloudflare Turnstile.
    // =========================================================================
    const CaptchaHandler = {
        /**
         * Inicia o processo de vigiar a resolução do captcha.
         */
        iniciar: () => {
            Utils.mostrarMensagem("CAPTCHA", `Aguardando validação do Cloudflare...`, "#ffa502");
            CaptchaHandler.vigiarResultado(Date.now());
        },

        /**
         * Loop para verificar periodicamente o status do captcha.
         * @param {number} startTime - O timestamp de quando o captcha foi detectado.
         */
        vigiarResultado: (startTime) => {
            // Se o script não estiver ativo ou exceder o tempo limite do captcha, toma ações corretivas.
            if (!STATE.isScriptActive || Date.now() - startTime > CONFIG.TIMERS_MS.CAPTCHA_TIMEOUT) {
                if (STATE.isScriptActive) Utils.mostrarMensagem("WATCHDOG", "❌ Timeout no CAPTCHA. Recarregando página...", "#ff4757");
                if (STATE.isScriptActive) location.reload(); // Recarrega a página se houver timeout
                return;
            }

            try {
                const iframe = document.querySelector(CONFIG.SELETORES.CLOUDFLARE_IFRAME);
                const bodyText = document.body.innerText.toLowerCase();

                // Verifica se o iframe do Cloudflare não está mais visível
                // ou se nenhum dos textos de desafio do Cloudflare está mais no corpo da página.
                const captchaResolved = !Utils.isElementTrulyVisible(iframe) &&
                                        !CONFIG.FRASES_CHAVE.CLOUDFLARE_DESAFIO_TEXTO.some(t => bodyText.includes(t));

                if (captchaResolved) {
                    Utils.mostrarMensagem("CAPTCHA", `✔️ Validado! Prosseguindo...`, "#2ed573");
                    setTimeout(Logic.analisarEAgir, 500); // Pequena pausa antes de prosseguir
                    return;
                }
            } catch (e) {
                Utils.log("Erro ao acessar/verificar iframe do Cloudflare (pode ser cross-origin):", e.message);
            }

            // Continua a vigilância se o captcha ainda não foi resolvido
            setTimeout(() => CaptchaHandler.vigiarResultado(startTime), CONFIG.TIMERS_MS.CAPTCHA_CHECK_INTERVAL);
        },
    };

    // =========================================================================
    // 🧠 5. LÓGICA DE NEGÓCIO E ESTADOS
    // Contém a inteligência principal do script para decidir qual ação tomar.
    // =========================================================================
    const Logic = {
        /**
         * Determina o período atual do dia (pico ou aguardo) com base em regras de horário.
         * Isso influencia a frequência de recarregamento da página.
         * @returns {{tipo: string, descricao: string}} - Um objeto com o tipo de período ("PICO", "AGUARDO") e uma descrição.
         */
        getPeriodoAtual: () => {
            const agora = new Date();
            const [d, h, m] = [agora.getDay(), agora.getHours(), agora.getMinutes()]; // d=Dia (Domingo=0, Segunda=1...)

            // HORÁRIO DO PICO DE RESERVA ANTECIPADA COM MARGEM DE 2 MINUTOS
            // De 16:58 (17h - 2min) até 17:02 (17h + 2min) para Almoço.
            const MIN_OFFSET = 2; // Margem de 2 minutos
            const PICO_HOUR_RESERVA = 17;
            const startMinuteReserva = PICO_HOUR_RESERVA * 60 - MIN_OFFSET; // Ex: 16 * 60 + 58 = 1018
            const endMinuteReserva = PICO_HOUR_RESERVA * 60 + MIN_OFFSET;     // Ex: 17 * 60 + 2 = 1022
            const currentMinuteTotal = h * 60 + m;

            // Reserva Antecipada (Almoço) para Segundas (1) e Terças (2) às 17h.
            if ((d === 1 || d === 2) && (currentMinuteTotal >= startMinuteReserva && currentMinuteTotal <= endMinuteReserva)) {
                return { tipo: 'PICO', descricao: `Reserva antecipada (Seg/Ter ${PICO_HOUR_RESERVA}h +/- ${MIN_OFFSET}min)` };
            }

            // Outros horários de pico específicos do Almoço
            if ((h === 9 && m >= 43 && m <= 47)) return { tipo: 'PICO', descricao: 'Abertura 9h45' };
            if ((h === 10 && m >= 58) || (h === 11 && m <= 2)) return { tipo: 'PICO', descricao: 'Abertura 11h' };
            if ((h === 12 && m >= 43 && m <= 59)) return { tipo: 'PICO', descricao: 'Xepa 12h43' };

            return { tipo: 'AGUARDO', descricao: 'Fora do pico' };
        },

        /**
         * Analisa o estado atual da página e executa a ação apropriada.
         * É a função central de tomada de decisões do script.
         */
        analisarEAgir: () => {
            if (!STATE.isScriptActive) return;

            // Reinicia o timer do watchdog a cada ação para evitar reinicialização desnecessária.
            clearTimeout(STATE.watchdogTimer);
            STATE.watchdogTimer = setTimeout(() => {
                Utils.mostrarMensagem("WATCHDOG", "Script travado. Reiniciando página...", "#ff4757");
                location.href = CONFIG.URL_ATIVACAO; // Redireciona para a URL de ativação em caso de travamento
            }, CONFIG.TIMERS_MS.WATCHDOG);

            // ================================================================
            // ETAPA 1: VERIFICAR ESTADOS FINAIS E DE SUCESSO
            // Estas verificações têm a prioridade mais alta.
            // ================================================================
            const popupTitle = document.querySelector(CONFIG.SELETORES.POPUP_COMPRA_FEITA_MENSAGEM);
            if (popupTitle && Utils.isElementTrulyVisible(popupTitle) && popupTitle.textContent.toLowerCase().includes(CONFIG.FRASES_CHAVE.COMPRA_REALIZADA)) {
                Utils.mostrarMensagem("OBJETIVO ATINGIDO", "Popup de compra detectado! Clicando para liberar a fila...", "#2ed573");
                const botaoLiberar = document.querySelector(CONFIG.SELETORES.BOTAO_LIBERAR_FILA);
                if (botaoLiberar) {
                    botaoLiberar.click();
                    Utils.mostrarMensagem("FINALIZADO", "✅ Vaga liberada! Automação concluída.", "#00bfff");
                } else {
                    Utils.mostrarMensagem("ERRO CRÍTICO", "Popup detectado, mas o botão 'Liberar Fila' não foi encontrado!", "#ff4757");
                }
                clearTimeout(STATE.watchdogTimer);
                STATE.isScriptActive = false; // Desativa o script após o sucesso da compra
                return;
            }

            const bodyText = document.body.innerText.toLowerCase();

            // Verificação de erros HTTP comuns ou estado final de "já na fila"
            if (bodyText.includes(CONFIG.FRASES_CHAVE.ERRO_404_PG)) {
                Utils.mostrarMensagem("ERRO", "Página não encontrada (404). Retornando à página de seleção...", "#ff4757");
                setTimeout(() => { location.href = CONFIG.URL_ATIVACAO; }, 3000); // Redireciona após 3 segundos
                return;
            }
            if (CONFIG.FRASES_CHAVE.STATUS_FIM_COMPRA.some(s => bodyText.includes(s))) {
                Utils.mostrarMensagem("NA FILA", "✅ Sucesso! Posição na fila ou aquisição garantida.", "#2ed573");
                clearTimeout(STATE.watchdogTimer);
                STATE.isScriptActive = false; // Desativa o script ao confirmar que a refeição está garantida
                return;
            }

            // ================================================================
            // ETAPA 2: VERIFICAR E RESOLVER INTERAÇÕES ESPECÍFICAS (Captcha, Clique Principal)
            // ================================================================
            // Checar se o Cloudflare Turnstile (captcha) está ativo
            if (document.querySelector(CONFIG.SELETORES.CLOUDFLARE_IFRAME) || CONFIG.FRASES_CHAVE.CLOUDFLARE_DESAFIO_TEXTO.some(t => bodyText.includes(t))) {
                CaptchaHandler.iniciar();
                return; // Espera o CAPTCHA ser resolvido
            }

            // Ação principal: Tentar clicar no link específico para "Almoço"
            const botaoSelecionarAlmoco = document.querySelector(CONFIG.SELETORES.BOTAO_SELECIONAR_ALMOCO);
            if (botaoSelecionarAlmoco && Utils.isElementTrulyVisible(botaoSelecionarAlmoco)) {
                Utils.mostrarMensagem("AÇÃO", `🍽️ Clicando no link '${CONFIG.TIPO_REFEICAO_ALVO}' para entrar na fila...`, "#3742fa");
                botaoSelecionarAlmoco.click();
                return; // Ação executada, aguarda a próxima página/renderização
            }

            // Fallback: Lógica para clicar no painel de refeição genérico, caso o seletor específico falhe ou a página mude.
            const painelAlvo = Array.from(document.querySelectorAll(CONFIG.SELETORES.PAINEL_SELECIONAR_REFEICAO))
                               .find(el => el.textContent.includes(CONFIG.TIPO_REFEICAO_ALVO));
            if (painelAlvo && Utils.isElementTrulyVisible(painelAlvo)) {
                Utils.mostrarMensagem("AÇÃO", `🍽️ Clicando no painel '${CONFIG.TIPO_REFEICAO_ALVO}' (fallback)...`, "#3742fa");
                // Clicar no pai (a tag <a>) que contém o h1, pois é o elemento clicável do painel.
                painelAlvo.parentElement.click();
                return;
            }

            // ================================================================
            // ETAPA 3: ESTADOS DE ESPERA (RECARREGAR OU REDIRECIONAR QUANDO NADA Acontece)
            // ================================================================
            // Se nenhuma das ações acima foi tomada, estamos em um estado de espera.
            const periodoAtual = Logic.getPeriodoAtual();
            // Define o tempo de recarga: rápido se for pico, normal caso contrário.
            const tempoRecarga = (periodoAtual.tipo === "PICO") ? CONFIG.TIMERS_MS.RELOAD_RAPIDO : CONFIG.TIMERS_MS.RELOAD_NORMAL;
            const cor = (periodoAtual.tipo === "PICO") ? "#ff6348" : "#747d8c";
            // Verifica se há a mensagem de "sem refeições disponíveis"
            const msg = bodyText.includes(CONFIG.FRASES_CHAVE.SEM_REFEICOES) ? "Sem refeições disponíveis." : "Página inicial ou aguardando ação.";

            // Informa ao usuário e agenda a próxima recarga da página.
            Utils.mostrarMensagem("AGUARDANDO", `⏳ ${msg} Recarregando em ${tempoRecarga / 1000}s...`, cor);
            setTimeout(() => location.reload(), tempoRecarga);
        },
    };

    // =========================================================================
    // 🚀 6. INICIALIZAÇÃO DO SCRIPT
    // Controla o ponto de entrada e ativação do script.
    // =========================================================================
    const Main = {
        /**
         * Ponto de entrada principal do script.
         * Verifica a URL atual para ativar o script ou exibi-lo como inativo.
         */
        init: () => {
            // Verifica se a URL atual corresponde à URL de ativação configurada.
            if (window.location.href.startsWith(CONFIG.URL_ATIVACAO.split('?')[0])) {
                Utils.mostrarMensagem("INICIALIZANDO", `Script ${CONFIG.TIPO_REFEICAO_ALVO} v${CONFIG.version} INICIADO!`, "#00bfff");
                // Pequeno atraso para permitir que todos os elementos da página carreguem antes de iniciar a lógica.
                setTimeout(Logic.analisarEAgir, CONFIG.TIMERS_MS.CARGA_PAGINA_DELAY);
            } else {
                // Exibe uma mensagem de inatividade se a página não for a de seleção de refeição.
                Utils.mostrarMensagem("INATIVO", "Automação pausada nesta página.", "#747d8c");
            }
        },
    };

    // O script começa a rodar assim que a página é totalmente carregada (evento 'load').
    window.addEventListener("load", Main.init);
})();
