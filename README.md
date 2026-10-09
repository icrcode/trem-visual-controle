# Simulador XP500



Simulador interativo de um trem andando sobre o circuito ferroviário **XP500**, feito com HTML, CSS e JavaScript puro (sem dependências nem build).

O trem (locomotiva + vagões) percorre os trilhos desenhados a partir do SVG original do circuito. Nas bifurcações (agulhas) a rota pode ser escolhida pelo usuário ou sorteada automaticamente.

## Funcionalidades

- Iniciar, pausar e reiniciar a simulação
- Controle de velocidade
- Decisão de rota nas agulhas: **manual** (botões + prévia colorida do caminho) ou **automática**
- Fins de linha com inversão de sentido
- Cruzamentos sem conexão (o trem segue reto)
- Áreas interativas com tooltip e indicação da área atual do trem

## Como rodar

Abra o `index.html` no navegador. Se o navegador bloquear arquivos locais, sirva a pasta com um servidor simples:

```bash
python -m http.server
```

e acesse `http://localhost:8000`.

## Estrutura

```
index.html                 página principal
css/estilo.css             estilos
assets/xp-500.svg|png      desenho original do circuito
js/
  circuito.js              configuração do circuito (segmentos, agulhas, áreas) e consultas da topologia
  pista.js                 desenho dos trilhos
  trem.js                  desenho do trem e dos vagões sobre o rastro
  movimento.js             motor de movimento (posição, velocidade, passagem pelos nós)
  decisoes.js              escolha de rota nas bifurcações
  areas.js                 áreas interativas e tooltip
  controles.js             painel de controles e indicadores
  principal.js             inicialização e ligação entre os módulos
ferramentas/
  gerar_tracados.py        extrai o eixo central dos trilhos do SVG original
```

## Mapa Utilizado
Mapa baseado em cima do modelo do XP-500 do Ferrorama Estrela!

![xp-500.png](assets/xp-500.png)

## Gerando os traçados

Os traçados usados em `js/circuito.js` são gerados a partir de `assets/xp-500.svg`:

```bash
pip install numpy scipy matplotlib opencv-contrib-python
python ferramentas/gerar_tracados.py assets/xp-500.svg
```

O script imprime o atributo `d` de cada segmento, pronto para colar na configuração.
