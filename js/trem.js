/**
 * trem.js
 * Desenho do trem (locomotiva + vagões coloridos) sobre o circuito.
 *
 * O motor de movimento informa apenas a posição da frente do trem. Este
 * módulo guarda o rastro percorrido por essa frente e encaixa cada carro
 * sobre o rastro, a uma distância fixa atrás da frente — assim os vagões
 * seguem exatamente o trilho, inclusive em curvas, agulhas e cruzamentos.
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  const NS_SVG = 'http://www.w3.org/2000/svg';
  /** Distância mínima entre dois pontos guardados no rastro. */
  const PASSO_RASTRO = 0.5;
  /** Folga de rastro mantida além do comprimento do trem. */
  const FOLGA_RASTRO = 40;

  /** Pontos visitados pela frente do trem, do mais antigo para o mais recente. */
  let rastro = [];
  /** true quando a locomotiva está atrás, empurrando os vagões. */
  let invertido = false;
  /** Carros na ordem da composição (locomotiva primeiro): {elemento, comprimento, ehLocomotiva}. */
  let carros = [];

  const circuito = () => window.XP500.circuito;

  /**
   * Cria um retângulo SVG para a locomotiva e para cada vagão.
   * @param {SVGGElement} grupo Grupo SVG que receberá o trem.
   */
  function prepararTrem(grupo) {
    const { trem } = circuito().configuracao;
    carros = [criarCarro(trem.locomotiva, trem.largura, 'locomotiva', true)]
      .concat(trem.vagoes.map((vagao) => criarCarro(vagao, trem.largura, 'vagao', false)));
    // Desenha do último vagão para a locomotiva, que fica por cima.
    carros.slice().reverse().forEach((carro) => grupo.appendChild(carro.elemento));
  }

  /** Retângulo centrado na origem, com o comprimento no eixo x (frente em +x). */
  function criarCarro(carro, largura, classe, ehLocomotiva) {
    const elemento = document.createElementNS(NS_SVG, 'rect');
    Object.entries({ x: -carro.comprimento / 2, y: -largura / 2, width: carro.comprimento, height: largura, fill: carro.cor })
      .forEach(([nome, valor]) => elemento.setAttribute(nome, valor));
    elemento.setAttribute('class', 'carro ' + classe);
    return { elemento, comprimento: carro.comprimento, ehLocomotiva };
  }

  /** Esquece o rastro (usado ao reiniciar); o próximo posicionamento o reconstrói. */
  function limparTrem() {
    rastro = [];
    invertido = false;
  }

  /**
   * Atualiza o rastro com a nova posição da frente e redesenha os carros.
   * @param {{segmentoId:string, distancia:number, sentido:number, x:number, y:number}} posicao
   */
  function atualizarTrem(posicao) {
    if (rastro.length === 0) {
      rastro = montarRastroInicial(posicao);
    } else {
      const ultimo = rastro[rastro.length - 1];
      if (Math.hypot(posicao.x - ultimo.x, posicao.y - ultimo.y) >= PASSO_RASTRO) rastro.push({ x: posicao.x, y: posicao.y });
    }
    podarRastro();
    desenharCarros();
  }

  /**
   * Na posição inicial ainda não há rastro: os carros são colocados para trás
   * ao longo do próprio segmento (limitados ao início/fim dele).
   */
  function montarRastroInicial(posicao) {
    const necessario = circuito().calcularComprimentoTrem() + FOLGA_RASTRO;
    const pontos = [];
    for (let recuo = necessario; recuo > 0; recuo -= 2) {
      pontos.push(circuito().obterPontoNoSegmento(posicao.segmentoId, posicao.distancia - posicao.sentido * recuo));
    }
    pontos.push({ x: posicao.x, y: posicao.y });
    return pontos;
  }

  /** Mantém só o trecho de rastro necessário para desenhar o trem. */
  function podarRastro() {
    const necessario = circuito().calcularComprimentoTrem() + FOLGA_RASTRO;
    let acumulado = 0;
    for (let i = rastro.length - 1; i > 0; i--) {
      acumulado += Math.hypot(rastro[i].x - rastro[i - 1].x, rastro[i].y - rastro[i - 1].y);
      if (acumulado > necessario) {
        rastro = rastro.slice(i - 1);
        return;
      }
    }
  }

  /**
   * Ponto do rastro a uma distância atrás da frente do trem.
   * @param {number} distancia
   * @returns {{x:number, y:number}}
   */
  function obterPontoAtras(distancia) {
    let restante = distancia;
    for (let i = rastro.length - 1; i > 0; i--) {
      const atual = rastro[i];
      const anterior = rastro[i - 1];
      const trecho = Math.hypot(atual.x - anterior.x, atual.y - anterior.y);
      if (restante <= trecho) {
        const fracao = trecho === 0 ? 0 : restante / trecho;
        return { x: atual.x + (anterior.x - atual.x) * fracao, y: atual.y + (anterior.y - atual.y) * fracao };
      }
      restante -= trecho;
    }
    return rastro[0];
  }

  /** Posiciona cada carro no rastro e o gira na direção entre seu ponto dianteiro e o traseiro. */
  function desenharCarros() {
    const { espacamento } = circuito().configuracao.trem;
    const ordemNoRastro = invertido ? carros.slice().reverse() : carros;
    let recuo = 0;
    ordemNoRastro.forEach((carro) => {
      const frente = obterPontoAtras(recuo);
      const traseira = obterPontoAtras(recuo + carro.comprimento);
      let angulo = Math.atan2(frente.y - traseira.y, frente.x - traseira.x) * 180 / Math.PI;
      if (carro.ehLocomotiva && invertido) angulo += 180; // frente da locomotiva continua para fora da composição
      // O centro fica sobre o próprio rastro (e não no meio da corda), para não "cortar" as curvas.
      const centro = obterPontoAtras(recuo + carro.comprimento / 2);
      carro.elemento.setAttribute('transform', `translate(${centro.x.toFixed(2)} ${centro.y.toFixed(2)}) rotate(${angulo.toFixed(2)})`);
      recuo += carro.comprimento + espacamento;
    });
  }

  /**
   * Chamado quando o trem inverte o sentido no para-choque: a cauda vira a
   * nova frente, então o rastro ocupado pelo trem é invertido.
   */
  function inverterTrem() {
    const comprimento = circuito().calcularComprimentoTrem();
    const ocupado = [];
    for (let recuo = 0; recuo < comprimento; recuo += 2) ocupado.push(obterPontoAtras(recuo));
    ocupado.push(obterPontoAtras(comprimento));
    rastro = ocupado; // do antigo mais recente (locomotiva) até a cauda, que agora é a frente
    invertido = !invertido;
  }

  window.XP500.trem = {
    prepararTrem,
    atualizarTrem,
    inverterTrem,
    limparTrem,
  };
})();
