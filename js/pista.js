/**
 * pista.js
 * Desenho da pista: um traço contínuo sobre cada traçado-guia de circuito.js
 * (os eixos dos trilhos, extraídos do SVG original). Assim a pista mantém o
 * formato original, mas com a espessura definida na configuração.
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  const NS_SVG = 'http://www.w3.org/2000/svg';

  const circuito = () => window.XP500.circuito;

  /**
   * Desenha um traço para cada segmento no grupo SVG indicado.
   * @param {SVGGElement} grupo
   */
  function desenharPista(grupo) {
    const { segmentos, pista } = circuito().configuracao;
    Object.values(segmentos).forEach((segmento) => {
      const trilho = document.createElementNS(NS_SVG, 'path');
      trilho.setAttribute('d', segmento.tracado);
      trilho.setAttribute('stroke', pista.cor);
      trilho.setAttribute('stroke-width', pista.larguraTrilho);
      trilho.setAttribute('class', 'trilho');
      grupo.appendChild(trilho);
    });
  }

  window.XP500.pista = {
    desenharPista,
  };
})();
