# €iclo

**€iclo** — aplicação pessoal de controlo de despesas, de ordenado a ordenado (mensal e anual), que funciona no PC e no telemóvel.

**Este repositório tem apenas o programa. Não contém dados pessoais.**
Os dados ficam num repositório **privado** à parte (`ciclo-dados`), **encriptados** no próprio dispositivo (AES‑256‑GCM, com uma chave derivada da tua palavra‑passe através de PBKDF2‑SHA256 com 310 000 iterações). O GitHub só guarda um ficheiro ilegível.

## Como funciona

- A app é publicada pelo GitHub Pages: `https://hikami2.github.io/ciclo/`
- Cada dispositivo (PC e telemóvel) liga-se uma vez com:
  1. um **token do GitHub** com acesso **apenas** ao repositório `ciclo-dados`;
  2. a tua **palavra‑passe de encriptação**, que nunca sai do dispositivo.
- As alterações são gravadas no dispositivo e sincronizadas automaticamente. Se não houver internet, a app continua a funcionar e sincroniza quando a ligação voltar.
- Cada sincronização é um commit no repositório de dados, por isso tens um histórico completo de versões.

## Configuração (uma única vez)

### 1. Token do GitHub (fine-grained)
1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Nome: `eciclo`. Validade: 1 ano (põe um lembrete para o renovares).
3. **Repository access → Only select repositories →** `ciclo-dados`.
4. **Permissions → Repository permissions → Contents: Read and write**. Não dês mais nenhuma permissão.
5. Gera o token e copia‑o. Vais colá‑lo na app em cada dispositivo. Não o guardes em lado nenhum público.

### 2. No PC
1. Na app local (`Minhas_Despesas.html`): **Definições → Exportar cópia de segurança**.
2. Abre `https://hikami2.github.io/ciclo/` e vai a **Definições → Importar cópia…**, escolhendo esse ficheiro.
3. **Configurar sincronização**: cola o token, escolhe uma palavra‑passe forte (pelo menos 10 caracteres) e repete‑a.
4. Depois de veres "Sincronizado", **apaga o ficheiro da cópia exportada**, porque não está encriptado.

### 3. No telemóvel
1. Abre o mesmo link.
   - **iPhone (Safari)**: Partilhar → **Adicionar ao ecrã principal**.
   - **Android (Chrome)**: menu ⋮ → **Instalar aplicação** (ou Adicionar ao ecrã principal).
2. Abre a app a partir do ícone → **Configurar sincronização** → cola o mesmo token e a mesma palavra‑passe.

## Segurança

- Ativa a **autenticação de dois fatores** na tua conta GitHub.
- O token só dá acesso ao repositório de dados e pode ser revogado a qualquer momento no GitHub.
- **Se perderes a palavra‑passe, os dados sincronizados não podem ser recuperados.** Exporta cópias de vez em quando e guarda‑as em local seguro.
- Num dispositivo que deixes de usar: **Definições → Terminar sessão neste dispositivo**.
- A app só comunica com `api.github.com`. Isto é imposto pela política de segurança (CSP) da página.
