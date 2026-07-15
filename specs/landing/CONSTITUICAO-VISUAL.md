# Trimote — Constituição Visual

> Identidade: **Tabernáculo Polida**. A hierarquia do santuário como sistema de design,
> com acabamento tech. Linho é a base, tekhelet é a ação, ouro é raro, carmesim alerta.

## Princípio-mestre

**Aparar.** Se um elemento não ajuda o dono a resolver o dia ou o cliente a agendar,
ele sai. Pouca cor, muito espaço, zero ruído. Convenção na mecânica, autoral na identidade.

## Cores (tokens semânticos — componente nunca conhece hex)

| Token                | Claro                                  | Escuro                                 | Papel |
|----------------------|----------------------------------------|----------------------------------------|-------|
| `fundo`              | `#F7F6F3`                              | `#10161F`                              | base de tudo |
| `superficie`         | `#FFFFFF`                              | `#171F2B`                              | cards |
| `superficie-2`       | `#F0EFEB`                              | `#1E2836`                              | inputs, rebaixos |
| `texto`              | `#1A1D23`                              | `#EEEDE8`                              | tinta / linho |
| `texto-secundario`   | `#626A76`                              | `#97A1AE`                              | aço — metadados |
| `borda`              | `#E2E3DF`                              | `#28323F`                              | divisões, elevação no escuro |
| `primaria`           | `#2B4C7E`                              | `#4774AA`                              | ação — tekhelet |
| `primaria-hover`     | `#23406C`                              | `#6190C4`                              | |
| `primaria-pressed`   | `#1B3459`                              | `#416A9C`                              | |
| `primaria-suave`     | `#E9EFF7`                              | `#1E2E44`                              | fundos de destaque |
| `anel-foco`          | `rgba(43,76,126,.35)`                  | `rgba(97,144,196,.40)`                 | focus-visible |
| `desabilitado-bg`    | `#E4E5E2`                              | `#232D3A`                              | |
| `desabilitado-texto` | `#9AA0A8`                              | `#6B7684`                              | |
| `ouro`               | `#D2A03A`                              | `#DFAC45`                              | marca — só logo e micro-detalhe |
| `ouro-metal`         | `135deg, #E3B54F → #C08A26`            | `135deg, #EBC05C → #C99730`            | gradiente do metálico |
| `ouro-suave` / texto | `#F6EDDA` / `#8F6812`                  | `#322C1D` / `#E6BE68`                  | badges |
| `carmesim`           | `#B0402F`                              | `#CE5A4B`                              | erro, saídas do caixa |
| `carmesim-suave`/txt | `#F7E7E3` / `#8A2F21`                  | `#35211D` / `#E5978A`                  | |
| `sucesso`            | `#2F8161`                              | `#4BA47B`                              | confirmações, entradas |
| `sucesso-suave`/txt  | `#E4F1EB` / `#205A43`                  | `#1C2F26` / `#83C6A4`                  | |

**Regras de ouro (literalmente):**
1. Ouro aparece no máximo em **2 pontos por tela** (logo + 1 detalhe). Nunca em botão, nunca em área grande.
2. Metálico = gradiente + filete de luz (`inset 0 1px 0 rgba(255,255,255,.14)` claro / `.08` escuro). Nunca textura, nunca bevel.
3. Dark mode troca **papéis**, não inverte cores: tekhelet vira fundo, linho vira texto. Sombra vira borda.
4. Verde de sucesso é exceção funcional consciente (convenção na mecânica).

**Emenda — contraste do `primaria` escuro (acessibilidade AA), #40.** No tema **escuro**, o token
`primaria` era `#4E7DB5`: sobre `primaria-texto` branco media **4.26:1**, abaixo do mínimo **4.5:1**
de WCAG 2.1 AA para texto normal (o CTA "Agendar uma conversa" reprovou no Lighthouse). Passa a
`#4774AA`, que mede **4.84:1** — dentro da família tekhelet, apenas mais escuro. O tema **claro**
(`#2B4C7E`) media **8.61:1** e **não muda**. `primaria-pressed`/`primaria-hover` escuros ficam como
estavam. Regra derivada: todo par ação/texto novo deve medir ≥ 4.5:1 antes de entrar na tabela.

## Tipografia (Google Fonts)

- **Fraunces** (títulos): 600/700 — **somente de 24px pra cima**. Abaixo disso, serifada em UI vira ruído.
- **Inter** (todo o resto): 400 corpo, 500 labels, 600 botões e H3.

Escala: 40 (display) · 32 (h1) · 24 (h2) · 18 (h3, Inter) · 15 (corpo) · 13 (small) · 11 caps +tracking .08em (caption).

## Espaço, raio, movimento

- Base **4px**: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Nada fora da escala.
- Raios: **6** inputs · **10** botões · **14** cards · **999** chips.
- Transições: 150ms ease em interação, 250ms em tema. Sem animação decorativa.
- Um CTA primário por tela. Densidade respira: padding de card mínimo 24px.

## Tom de voz

Amigável sem intimidade forçada; profissional sem burocracia. "Você", sempre.

- Diz **o que aconteceu e o que fazer**: "Esse horário acabou de ser preenchido. Escolha outro."
- Nunca exclama em dobro, nunca pede desculpa vaga ("Ops! Algo deu errado" — proibido).
- Vazio é convite: "Cadastre seu primeiro serviço para liberar a agenda." — nunca "Nenhum registro encontrado".
- Ação nos botões nomeia o resultado: "Confirmar às 10:30", não "Enviar".

## Presença de marca na página pública

A página pública é palco do **negócio do dono**, não do Trimote. A marca aparece apenas
no selo discreto "agendamento por trimote." (ouro no wordmark). O profissionalismo da
página É o marketing do Trimote.

## O significado (bússola interna)

Trimote = *trim* (aparar) + *Timóteo* (o mentor que escreve ao iniciante). As cores vêm
do Tabernáculo: linho (base/pureza), tekhelet (céu/fidelidade), ouro (raro/precioso),
carmesim (alerta). Ninguém precisa saber disso pra usar o app — mas toda decisão visual
nova deve caber nessa história. Se não cabe, apara.
