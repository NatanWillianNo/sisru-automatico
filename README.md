# 🍽️ SISRU Automático

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/NatanWillianNo/sisru-automatico/blob/main/LICENSE)
[![JavaScript](https://img.shields.io/badge/Language-JavaScript-yellow.svg)](https://www.javascript.com/)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Supported-brightgreen.svg)](https://www.tampermonkey.net/)
[![Issues](https://img.shields.io/github/issues/NatanWillianNo/sisru-automatico)](https://github.com/NatanWillianNo/sisru-automatico/issues)

Scripts automáticos para aquisição de **refeições no SISRU** (Almoço e Jantar) da **UNESP – Câmpus de Franca**.

O repositório contém dois scripts separados:

- [**sisru-almoco.user.js**](https://github.com/NatanWillianNo/sisru-automatico/blob/main/sisru-almoco.user.js) – automação para Almoço  
- [**sisru-jantar.user.js**](https://github.com/NatanWillianNo/sisru-automatico/blob/main/sisru-jantar.user.js) – automação para Jantar  

Ambos incluem:

- Detecção de **CAPTCHA** (Cloudflare/Turnstile)  
- Monitoramento de **popups de sucesso**  
- Clique automático em **“Liberar Fila”**  
- **HUD** (painel de status) exibindo período, estado e hora  
- **Logs detalhados** no console para depuração  

---

## 📌 Requisitos

- Navegador com **Tampermonkey** ou **Greasemonkey** instalado  
- **Conta válida** no SISRU UNESP – Câmpus de Franca  
- Conexão estável à Internet  

---

## 🚀 Instalação

1. Instale o **Tampermonkey** no seu navegador:  
   - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)  
   - [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/)  

2. Clique em **Add new script** e cole o código do script desejado (**Almoço** ou **Jantar**).  

3. Acesse a página do SISRU:  
[https://app.unesp.br/sisru-franca/](https://app.unesp.br/sisru-franca/)

4. O script será ativado automaticamente na página de aquisição de refeições.

---

## ⚡ Configuração

- Cada script possui configuração própria para o tipo de refeição.  
- **HUD** e **logs** podem ser personalizados diretamente nos scripts.  
- Tempos de recarga, **watchdog** e CAPTCHA podem ser ajustados conforme necessidade.  

---

## 📝 Observações

- Scripts funcionam **apenas para o Câmpus de Franca da UNESP**.  
- Não interferem em outras páginas do SISRU.  
- Use com responsabilidade, **respeitando as regras da universidade**.

---

## 📂 Estrutura do Repositório

```

sisru-automatico/
│
├─ sisru-jantar.user.js      # Script para Jantar
├─ sisru-almoco.user.js      # Script para Almoço
├─ sisru-jantar.user.md      # Documentação do script Jantar
├─ sisru-almoco.user.md      # Documentação do script Almoço
└─ README.md                 # Este arquivo

```

---

## 🔗 Links Úteis

- [Página do SISRU UNESP – Franca](https://app.unesp.br/sisru-franca/)  
- [Tampermonkey](https://www.tampermonkey.net/)  
- [Suporte / Issues do repositório](https://github.com/NatanWillianNo/sisru-automatico/issues)  
- [Documentação do script Almoço](https://github.com/NatanWillianNo/sisru-automatico/blob/main/sisru-almoco.user.md)  
- [Documentação do script Jantar](https://github.com/NatanWillianNo/sisru-automatico/blob/main/sisru-jantar.user.md)  
- [Licença MIT](https://github.com/NatanWillianNo/sisru-automatico/blob/main/LICENSE)  

---

## 📄 Licença
MIT License – veja o arquivo [LICENSE](https://github.com/NatanWillianNo/sisru-automatico/blob/main/LICENSE) para detalhes.

---
