/**
 * areas.js
 * Áreas interativas do circuito: desenha as zonas de destaque sobre o SVG,
 * exibe o tooltip com o nome da área e identifica em que área o trem está.
 *
 * Arquivo extra em relação à estrutura sugerida: separa a interação com as
 * áreas (visual + mouse) da configuração em circuito.js.
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  const NS_SVG = 'http://www.w3.org/2000/svg';
  /** Espaçamento entre pontos amostrados ao desenhar o contorno de um trecho. */
  const PASSO_AMOSTRAGEM = 6;
  const DESCRICAO_TIPO = {
    trecho: 'Trecho de trilho',
    agulha: 'Bifurcação com decisão de rota',
    cruzamento: 'Cruzamento sem conexão — a rota não muda',
    'fim-de-linha': 'Fim de linha',
  };

  const elementosPorArea = {};
  let tooltip = null;
  let palco = null;
  let areaDestacada = null;

  const circuito = () => window.XP500.circuito;

  /**
   * Cria um elemento SVG para cada área configurada e liga os eventos de mouse.
   * Os trechos são desenhados primeiro para que os pontos (agulhas,
   * cruzamentos) fiquem por cima.
   * @param {SVGGElement} grupo Grupo SVG das áreas.
   * @param {HTMLElement} elementoTooltip Caixa de informação contextual.
   * @param {HTMLElement} elementoPalco Contêiner usado como referência para posicionar o tooltip.
   */
  function montarAreas(grupo, elementoTooltip, elementoPalco) {
    tooltip = elementoTooltip;
    palco = elementoPalco;
    const areas = circuito().configuracao.areas;
    const ordenadas = areas.filter((a) => a.tipo === 'trecho').concat(areas.filter((a) => a.tipo === 'ponto'));
    ordenadas.forEach((area) => {
      const elemento = area.tipo === 'ponto' ? criarAreaPonto(area) : criarAreaTrecho(area);
      if (!elemento) return;
      elemento.dataset.area = area.id;
      elemento.setAttribute('aria-label', area.nome);
      elemento.addEventListener('pointerenter', (evento) => exibirTooltip(area, evento));
      elemento.addEventListener('pointermove', posicionarTooltip);
      elemento.addEventListener('pointerleave', ocultarTooltip);
      grupo.appendChild(elemento);
      elementosPorArea[area.id] = elemento;
    });
  }

  /** Faixa larga sobre o eixo do trilho, entre as frações "de" e "ate" do segmento. */
  function criarAreaTrecho(area) {
    const comprimento = circuito().obterComprimento(area.segmento);
    if (!comprimento) {
      console.warn(`[XP500] A área "${area.id}" usa o segmento inexistente "${area.segmento}".`);
      return null;
    }
    const inicio = area.de * comprimento;
    const fim = area.ate * comprimento;
    const pontos = [];
    for (let distancia = inicio; distancia < fim; distancia += PASSO_AMOSTRAGEM) {
      pontos.push(circuito().obterPontoNoSegmento(area.segmento, distancia));
    }
    pontos.push(circuito().obterPontoNoSegmento(area.segmento, fim));
    const caminho = document.createElementNS(NS_SVG, 'path');
    caminho.setAttribute('d', 'M' + pontos.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L'));
    caminho.setAttribute('class', 'area area-trecho');
    return caminho;
  }

  /** Círculo em torno de um ponto notável (agulha, cruzamento, para-choque). */
  function criarAreaPonto(area) {
    const circulo = document.createElementNS(NS_SVG, 'circle');
    circulo.setAttribute('cx', area.posicao.x);
    circulo.setAttribute('cy', area.posicao.y);
    circulo.setAttribute('r', area.raio);
    circulo.setAttribute('class', 'area area-ponto');
    return circulo;
  }

  /** Preenche e mostra o tooltip de uma área. */
  function exibirTooltip(area, evento) {
    const detalhe = area.tipo === 'trecho'
      ? `${DESCRICAO_TIPO.trecho} · ${circuito().obterSegmento(area.segmento).nome}`
      : DESCRICAO_TIPO[area.categoria] || '';
    tooltip.replaceChildren();
    const nome = document.createElement('strong');
    nome.textContent = area.nome;
    const info = document.createElement('span');
    info.textContent = detalhe;
    const id = document.createElement('code');
    id.textContent = area.id;
    tooltip.append(nome, info, id);
    tooltip.hidden = false;
    posicionarTooltip(evento);
  }

  /** Acompanha o ponteiro, mantendo o tooltip dentro do palco. */
  function posicionarTooltip(evento) {
    if (tooltip.hidden) return;
    const limites = palco.getBoundingClientRect();
    const margem = 14;
    let esquerda = evento.clientX - limites.left + margem;
    let topo = evento.clientY - limites.top + margem;
    if (esquerda + tooltip.offsetWidth > limites.width) esquerda = evento.clientX - limites.left - tooltip.offsetWidth - margem;
    if (topo + tooltip.offsetHeight > limites.height) topo = evento.clientY - limites.top - tooltip.offsetHeight - margem;
    tooltip.style.left = Math.max(0, esquerda) + 'px';
    tooltip.style.top = Math.max(0, topo) + 'px';
  }

  function ocultarTooltip() {
    tooltip.hidden = true;
  }

  /**
   * Identifica a área em que o trem está. Pontos (agulhas, cruzamentos)
   * têm prioridade; depois vale o trecho do segmento atual.
   * @param {{segmentoId:string, distancia:number, x:number, y:number}} posicao
   * @returns {Object|null} Configuração da área, ou null.
   */
  function identificarAreaAtual(posicao) {
    const areas = circuito().configuracao.areas;
    const ponto = areas.find((a) => a.tipo === 'ponto'
      && Math.hypot(a.posicao.x - posicao.x, a.posicao.y - posicao.y) <= a.raio);
    if (ponto) return ponto;
    const fracao = posicao.distancia / circuito().obterComprimento(posicao.segmentoId);
    return areas.find((a) => a.tipo === 'trecho' && a.segmento === posicao.segmentoId
      && fracao >= a.de && fracao <= a.ate) || null;
  }

  /** Aplica um realce discreto à área em que o trem está. */
  function destacarAreaAtual(area) {
    const id = area ? area.id : null;
    if (id === areaDestacada) return;
    if (areaDestacada && elementosPorArea[areaDestacada]) elementosPorArea[areaDestacada].classList.remove('area--atual');
    if (id && elementosPorArea[id]) elementosPorArea[id].classList.add('area--atual');
    areaDestacada = id;
  }

  window.XP500.areas = {
    montarAreas,
    identificarAreaAtual,
    destacarAreaAtual,
  };
})();
