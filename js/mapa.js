/**
 * mapa.js — desenho do mapa no estilo "app de navegação".
 *
 * Camadas (de baixo para cima): avenida, trilhos, rotas, sinalização das
 * passagens, carros, trem, área de clique, estações, alfinete de destino,
 * balões de tempo e cursor.
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  const NS_SVG = 'http://www.w3.org/2000/svg';
  /** Distância máxima (unidades) entre o clique e a pista para aceitar o ponto. */
  const RAIO_CLIQUE = 40;
  /** Distância entre as amostras usadas para achar o ponto da pista mais próximo do clique. */
  const PASSO_AMOSTRAS = 2;

  const camadas = {};
  let svg = null;
  let amostrasPista = []; // {segmentoId, distancia, x, y}
  let caminhoRotaAtiva = null;
  let comprimentoRotaAtiva = 0;

  const circuito = () => window.XP500.circuito;
  const config = () => window.XP500.configuracaoMapa;

  function criar(tag, atributos = {}, pai = null) {
    const elemento = document.createElementNS(NS_SVG, tag);
    Object.entries(atributos).forEach(([nome, valor]) => elemento.setAttribute(nome, valor));
    if (pai) pai.appendChild(elemento);
    return elemento;
  }

  /**
   * Cria as camadas e desenha trilhos e estações.
   * @param {SVGSVGElement} elementoSvg
   * @param {Object} acoes {aoEscolherPonto(ponto), aoEscolherEstacao(estacao, ponto)}
   */
  function montarMapa(elementoSvg, acoes) {
    svg = elementoSvg;
    ['tracados', 'estrada', 'trilhos', 'rotas', 'sinalizacao', 'carros', 'trem', 'origem', 'clique', 'estacoes', 'pino', 'baloes', 'cursor']
      .forEach((nome) => { camadas[nome] = criar('g', { class: `camada-${nome}` }, svg); });
    circuito().montarTracados(camadas.tracados);
    amostrarPista();
    desenharTrilhos();
    prepararClique(acoes.aoEscolherPonto);
    desenharEstacoes(acoes.aoEscolherEstacao);
    return camadas;
  }

  /** Guarda pontos de toda a pista para localizar cliques e estações. */
  function amostrarPista() {
    amostrasPista = [];
    Object.keys(circuito().configuracao.segmentos).forEach((segmentoId) => {
      const comprimento = circuito().obterComprimento(segmentoId);
      for (let distancia = 0; distancia <= comprimento; distancia += PASSO_AMOSTRAS) {
        amostrasPista.push({ segmentoId, distancia, ...circuito().obterPontoNoSegmento(segmentoId, distancia) });
      }
    });
  }

  /**
   * Ponto da pista mais próximo de uma coordenada do mapa.
   * @returns {{segmentoId:string, distancia:number, x:number, y:number, afastamento:number}}
   */
  function localizarPontoNaPista(x, y) {
    let melhor = null;
    let menor = Infinity;
    amostrasPista.forEach((amostra) => {
      const d = (amostra.x - x) ** 2 + (amostra.y - y) ** 2;
      if (d < menor) { menor = d; melhor = amostra; }
    });
    return { ...melhor, afastamento: Math.sqrt(menor) };
  }

  /** Trilho estilo mapa: base escura + dormentes tracejados. */
  function desenharTrilhos() {
    Object.values(circuito().configuracao.segmentos).forEach((segmento) => {
      criar('path', { d: segmento.tracado, class: 'trilho-borda' }, camadas.trilhos);
      criar('path', { d: segmento.tracado, class: 'trilho-base' }, camadas.trilhos);
      criar('path', { d: segmento.tracado, class: 'trilho-dormentes' }, camadas.trilhos);
    });
  }

  /** Converte a posição do ponteiro para coordenadas do desenho. */
  function converterParaMapa(evento) {
    const ponto = svg.createSVGPoint();
    ponto.x = evento.clientX;
    ponto.y = evento.clientY;
    return ponto.matrixTransform(svg.getScreenCTM().inverse());
  }

  /** Faixas invisíveis sobre os trilhos: clique define o destino; o cursor mostra onde. */
  function prepararClique(aoEscolherPonto) {
    Object.values(circuito().configuracao.segmentos).forEach((segmento) => {
      criar('path', { d: segmento.tracado, class: 'faixa-clique' }, camadas.clique);
    });
    const cursor = criar('circle', { r: 9, class: 'cursor-pista', visibility: 'hidden' }, camadas.cursor);

    camadas.clique.addEventListener('pointermove', (evento) => {
      const p = converterParaMapa(evento);
      const alvo = localizarPontoNaPista(p.x, p.y);
      cursor.setAttribute('cx', alvo.x);
      cursor.setAttribute('cy', alvo.y);
      cursor.setAttribute('visibility', 'visible');
    });
    camadas.clique.addEventListener('pointerleave', () => cursor.setAttribute('visibility', 'hidden'));
    camadas.clique.addEventListener('click', (evento) => {
      const p = converterParaMapa(evento);
      const alvo = localizarPontoNaPista(p.x, p.y);
      if (alvo.afastamento <= RAIO_CLIQUE) aoEscolherPonto(alvo);
    });
  }

  /** Marcadores redondos das estações, com nome. Clicar define a estação como destino. */
  function desenharEstacoes(aoEscolherEstacao) {
    config().estacoes.forEach((estacao) => {
      const ponto = localizarPontoNaPista(estacao.posicao.x, estacao.posicao.y);
      const grupo = criar('g', { class: 'estacao', transform: `translate(${ponto.x} ${ponto.y})`, tabindex: 0, role: 'button', 'aria-label': `Ir para ${estacao.nome}` }, camadas.estacoes);
      criar('circle', { r: 15, class: 'estacao-fundo' }, grupo);
      // Ícone de trem: corpo, janela e rodas.
      criar('rect', { x: -6, y: -7, width: 12, height: 11, rx: 2.5, class: 'estacao-icone' }, grupo);
      criar('rect', { x: -4, y: -5, width: 8, height: 4, class: 'estacao-janela' }, grupo);
      criar('circle', { cx: -3.5, cy: 6.5, r: 1.8, class: 'estacao-icone' }, grupo);
      criar('circle', { cx: 3.5, cy: 6.5, r: 1.8, class: 'estacao-icone' }, grupo);
      const rotulo = criar('text', { x: estacao.rotulo.dx, y: estacao.rotulo.dy, 'text-anchor': estacao.rotulo.ancora, class: 'estacao-nome' }, grupo);
      rotulo.textContent = estacao.nome;
      const escolher = () => aoEscolherEstacao(estacao, ponto);
      grupo.addEventListener('click', escolher);
      grupo.addEventListener('keydown', (evento) => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); escolher(); } });
    });
  }

  /** Alfinete de destino (formato de gota), com animação de queda. */
  function desenharPino(ponto) {
    camadas.pino.replaceChildren();
    const grupo = criar('g', { transform: `translate(${ponto.x} ${ponto.y})` }, camadas.pino);
    const queda = criar('g', { class: 'pino' }, grupo);
    criar('ellipse', { cx: 0, cy: 0, rx: 9, ry: 3.5, class: 'pino-sombra' }, grupo);
    criar('path', { d: 'M0 0 C-5 -12 -17 -20 -17 -33 A17 17 0 1 1 17 -33 C17 -20 5 -12 0 0 Z', class: 'pino-corpo' }, queda);
    criar('circle', { cx: 0, cy: -33, r: 6.5, class: 'pino-miolo' }, queda);
  }

  function limparPino() {
    camadas.pino.replaceChildren();
  }

  /**
   * Converte as pernas amostradas num "d" contínuo. Precisa ser um único
   * traço: o tracejado que esconde a parte percorrida recomeçaria a cada "M".
   */
  function montarCaminho(pernasAmostradas) {
    return 'M' + pernasAmostradas.flat().map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L');
  }

  /**
   * Desenha as rotas: alternativas em cinza, a selecionada em destaque por cima,
   * cada uma com um balão de tempo clicável.
   * @param {Array<Object>} rotas
   * @param {number} selecionada Índice em destaque.
   * @param {Array<string>} rotulos Texto do balão de cada rota.
   * @param {function(number):void} [aoSelecionar] Clique num balão/rota.
   */
  function desenharRotas(rotas, selecionada, rotulos, aoSelecionar) {
    limparRotas();
    const amostras = rotas.map((rota) => window.XP500.rotas.amostrarRota(rota));
    const ordem = rotas.map((_, i) => i).sort((a, b) => (a === selecionada) - (b === selecionada));
    ordem.forEach((i) => {
      const d = montarCaminho(amostras[i]);
      const classe = i === selecionada ? 'rota rota--ativa' : 'rota rota--alternativa';
      const grupo = criar('g', { class: classe }, camadas.rotas);
      criar('path', { d, class: 'rota-borda' }, grupo);
      const linha = criar('path', { d, class: 'rota-linha' }, grupo);
      if (i === selecionada) {
        caminhoRotaAtiva = linha;
        comprimentoRotaAtiva = linha.getTotalLength();
      }
      if (aoSelecionar) {
        grupo.addEventListener('click', () => aoSelecionar(i));
        desenharBalao(escolherPontoDoBalao(amostras, i), rotulos[i], i === selecionada, () => aoSelecionar(i));
      }
    });
  }

  /** Balão do tempo em um trecho exclusivo da rota (onde ela não se sobrepõe às outras). */
  function escolherPontoDoBalao(amostras, indice) {
    const proprios = amostras[indice].flat();
    const outros = amostras.filter((_, i) => i !== indice).map((a) => a.flat()).flat();
    let melhorInicio = 0;
    let melhorTamanho = 0;
    let inicio = -1;
    proprios.forEach((ponto, i) => {
      const exclusivo = outros.every((o) => Math.hypot(o.x - ponto.x, o.y - ponto.y) > 20);
      if (exclusivo && inicio < 0) inicio = i;
      if ((!exclusivo || i === proprios.length - 1) && inicio >= 0) {
        const fim = exclusivo ? i : i - 1;
        if (fim - inicio > melhorTamanho) { melhorTamanho = fim - inicio; melhorInicio = inicio; }
        inicio = -1;
      }
    });
    return melhorTamanho > 0 ? proprios[melhorInicio + Math.floor(melhorTamanho / 2)] : proprios[Math.floor(proprios.length / 2)];
  }

  function desenharBalao(ponto, texto, ativo, aoClicar) {
    const grupo = criar('g', { class: `balao ${ativo ? 'balao--ativo' : ''}`, transform: `translate(${ponto.x} ${ponto.y - 22})` }, camadas.baloes);
    const fundo = criar('rect', { y: -17, height: 34, rx: 17, class: 'balao-fundo' }, grupo);
    const rotulo = criar('text', { x: 0, y: 6, 'text-anchor': 'middle', class: 'balao-texto' }, grupo);
    rotulo.textContent = texto;
    const largura = rotulo.getComputedTextLength() + 30;
    fundo.setAttribute('x', -largura / 2);
    fundo.setAttribute('width', largura);
    criar('path', { d: 'M-7 16 L0 25 L7 16 Z', class: 'balao-fundo' }, grupo);
    grupo.addEventListener('click', aoClicar);
  }

  function limparRotas() {
    camadas.rotas.replaceChildren();
    camadas.baloes.replaceChildren();
    caminhoRotaAtiva = null;
  }

  /**
   * Esconde a parte já percorrida da rota ativa.
   * @param {number} fracaoPercorrida 0–1
   */
  function atualizarProgressoRota(fracaoPercorrida) {
    if (!caminhoRotaAtiva) return;
    const percorrido = comprimentoRotaAtiva * Math.min(Math.max(fracaoPercorrida, 0), 1);
    const valor = `0 ${percorrido.toFixed(1)} ${comprimentoRotaAtiva.toFixed(1)}`;
    caminhoRotaAtiva.style.strokeDasharray = valor;
    caminhoRotaAtiva.previousSibling.style.strokeDasharray = valor;
  }

  /** Anel pulsante na frente do trem (o "você está aqui"). */
  function atualizarOrigem(x, y) {
    // O grupo posiciona; o círculo de dentro pulsa (a animação CSS não briga com o translate).
    if (!camadas.origem.firstChild) criar('circle', { r: 26, class: 'origem-pulso' }, criar('g', {}, camadas.origem));
    camadas.origem.firstChild.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  }

  window.XP500.mapa = {
    montarMapa,
    localizarPontoNaPista,
    desenharPino,
    limparPino,
    desenharRotas,
    limparRotas,
    atualizarProgressoRota,
    atualizarOrigem,
  };
})();
