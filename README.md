# 🍽️ SISRU Automático

Automação para aquisição de refeições no **SISRU** (Almoço e Jantar) da **UNESP – Câmpus de Franca**.  
O repositório contém **dois scripts separados**: um para **Almoço** e outro para **Jantar**.  

Ambos os scripts possuem recursos de:
- Detecção de **CAPTCHA**.
- Monitoramento de **popups de sucesso**.
- Clique automático em **“Liberar Fila”**.
- HUD (painel de status) exibindo período, estado e hora.
- Logs detalhados no console para depuração.

---

## 📌 Requisitos

- Navegador com **Tampermonkey** ou **Greasemonkey** instalado.
- Conta válida no **SISRU UNESP – Câmpus de Franca**.
- Conexão estável à internet.

---

## 🚀 Instalação

1. Instale o **Tampermonkey** no seu navegador:  
   - [Chrome](https://tampermonkey.net/?ext=dhdg&browser=chrome)  
   - [Firefox](https://tampermonkey.net/?ext=dhdg&browser=firefox)
2. Clique em "**Add new script**" e cole o código do script de **Almoço** ou **Jantar**.
3. Salve e acesse a página do SISRU:  
   `https://app.unesp.br/sisru-franca/`
4. O script será ativado automaticamente na página de aquisição de refeições.

---

## ⚡ Configuração

- Cada script possui configuração própria para o tipo de refeição.
- HUD e logs podem ser personalizados diretamente nos scripts.
- Tempos de recarga, watchdog e CAPTCHA podem ser ajustados conforme necessidade.

---

## 📝 Observações

- Scripts funcionam apenas para o **Câmpus de Franca** da UNESP.
- Não interferem em outras páginas do SISRU.
- Use com responsabilidade, respeitando as regras da universidade.

---

## 📂 Estrutura do repositório

```
sisru-automatico/
│
├─ sisru-jantar.user.js   # Script para Jantar
├─ sisru-almoco.user.js   # Script para Almoço
└─ README.md
```

---

## 🔗 Links Úteis

- [Página do SISRU UNESP – Franca](https://app.unesp.br/sisru-franca/)  
- [Tampermonkey](https://www.tampermonkey.net/)

---

## 📄 Licença

MIT License – veja o arquivo LICENSE para detalhes.
