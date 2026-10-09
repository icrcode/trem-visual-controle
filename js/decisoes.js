/**
 * decisoes.js
 * Bifurcações: identifica quando uma agulha exige escolha e entrega o caminho
 * ao motor de movimento (por meio do callback aoConfirmar).
 * - Modo automático: o caminho é sorteado na hora e o trem não para.
 * - Modo manual: mostra os caminhos (botões no painel + prévia colorida no
 *   circuito) e espera o clique do usuário.
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  const NS_SVG = 'http://www.w3.org/2000/svg';
  /** Extensão (em unidades do desenho) da prévia de rota desenhada a partir da agulha. */
  const EXTENSAO_PREVIA = 200;

  const elementos = {};
  let decisaoAtual = null; // {noId, caminhos}
  let aoConfirmar = null;
  let aoAviso = null;
  let automatico = false;

  const circuito = () => window.XP500.circuito;

  /**
   * Liga o painel de decisão aos elementos da página.
   * @param {Object} opcoes
   * @param {HTMLElement} opcoes.painel Caixa de decisão (fica oculta sem bifurcação pendente).
   * @param {SVGGElement} opcoes.camadaPrevia Grupo SVG onde a prévia de rota é desenhada.
   * @param {function(string, string):void} opcoes.aoConfirmar Recebe (noId, caminhoId).
   * @param {function(string):void} [opcoes.aoAviso] Informa as escolhas automáticas.
   */
  function prepararPainelDecisao(opcoes) {
    elementos.painel = opcoes.painel;
    elementos.titulo = opcoes.painel.querySelector('[data-decisao="titulo"]');
    elementos.opcoes = opcoes.painel.querySelector('[data-decisao="opcoes"]');
    elementos.camadaPrevia = opcoes.camadaPrevia;
    aoConfirmar = opcoes.aoConfirmar;
    aoAviso = opcoes.aoAviso;
    automatico = circuito().configuracao.modoDecisaoInicial === 'automatica';
    ocultarDecisao();
  }

  /**
   * Liga ou desliga a decisão automática. Se o trem já estiver esperando,
   * a escolha pendente é resolvida na hora.
   * @param {boolean} ativo
   */
  function definirModoAutomatico(ativo) {
    automatico = ativo;
    if (automatico && decisaoAtual) escolherAutomaticamente(decisaoAtual.noId, decisaoAtual.caminhos);
  }

  /** @returns {boolean} true se as agulhas estão no modo automático. */
  function estaNoModoAutomatico() {
    return automatico;
  }

  /**
   * Indica se a chegada a um nó exige que o usuário escolha o caminho.
   * Só agulhas cadastradas, alcançadas pela ponta e com 2+ caminhos, são
   * bifurcações — proximidade ou cruzamento de linhas no desenho nunca são.
   * @param {string} noId
   * @param {{segmento:string, extremidade:string}} chegada
   * @returns {boolean}
   */
  function verificarBifurcacao(noId, chegada) {
    return circuito().listarSaidas(noId, chegada).length > 1;
  }

  /**
   * Trata uma bifurcação: no modo automático escolhe na hora; no manual,
   * mostra os caminhos e espera o usuário.
   * @param {{noId:string, chegada:Object}} pendencia
   */
  function exibirDecisao(pendencia) {
    const no = circuito().obterNo(pendencia.noId);
    const caminhos = circuito().listarSaidas(pendencia.noId, pendencia.chegada);
    decisaoAtual = { noId: pendencia.noId, caminhos };
    if (automatico) {
      escolherAutomaticamente(pendencia.noId, caminhos);
      return;
    }

    elementos.titulo.textContent = no.nome;
    elementos.opcoes.replaceChildren();
    caminhos.forEach((caminho, indice) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'opcao-rota opcao-rota--' + indice;
      botao.textContent = `${caminho.id} · ${caminho.rotulo}`;
      botao.title = caminho.descricao || '';
      botao.addEventListener('click', () => selecionarCaminho(caminho.id));
      elementos.opcoes.appendChild(botao);
    });
    elementos.painel.hidden = false;
    desenharPrevias(no, caminhos);
  }

  /**
   * Aplica o caminho escolhido e libera o trem.
   * @param {string} caminhoId
   */
  function selecionarCaminho(caminhoId) {
    if (!decisaoAtual) return;
    const { noId } = decisaoAtual;
    ocultarDecisao();
    if (aoConfirmar) aoConfirmar(noId, caminhoId);
  }

  /** Sorteia um dos caminhos, avisa qual foi e o aplica. */
  function escolherAutomaticamente(noId, caminhos) {
    const caminho = caminhos[Math.floor(Math.random() * caminhos.length)];
    if (aoAviso) aoAviso(`${circuito().obterNo(noId).nome}: rota automática ${caminho.id} · ${caminho.rotulo}`);
    selecionarCaminho(caminho.id);
  }

  /** Esconde a caixa de decisão e apaga a prévia. */
  function ocultarDecisao() {
    decisaoAtual = null;
    elementos.painel.hidden = true;
    elementos.opcoes.replaceChildren();
    elementos.camadaPrevia.replaceChildren();
  }

  /** Desenha o início de cada caminho com a mesma cor do seu botão e marca a agulha. */
  function desenharPrevias(no, caminhos) {
    elementos.camadaPrevia.replaceChildren();
    caminhos.forEach((caminho, indice) => {
      const trecho = document.createElementNS(NS_SVG, 'path');
      trecho.setAttribute('d', montarTrechoAPartirDaExtremidade(caminho.segmento, caminho.extremidade));
      trecho.setAttribute('class', `previa-rota previa-rota--${indice}`);
      elementos.camadaPrevia.appendChild(trecho);
    });
    const marcador = document.createElementNS(NS_SVG, 'rect');
    marcador.setAttribute('x', no.posicao.x - 30);
    marcador.setAttribute('y', no.posicao.y - 30);
    marcador.setAttribute('width', 60);
    marcador.setAttribute('height', 60);
    marcador.setAttribute('class', 'marcador-agulha');
    elementos.camadaPrevia.appendChild(marcador);
  }

  /** Gera o "d" dos primeiros EXTENSAO_PREVIA do segmento, a partir da extremidade dada. */
  function montarTrechoAPartirDaExtremidade(segmentoId, extremidade) {
    const comprimento = circuito().obterComprimento(segmentoId);
    const extensao = Math.min(EXTENSAO_PREVIA, comprimento);
    const pontos = [];
    for (let percorrido = 0; percorrido <= extensao; percorrido += 6) {
      const distancia = extremidade === 'inicio' ? percorrido : comprimento - percorrido;
      const ponto = circuito().obterPontoNoSegmento(segmentoId, distancia);
      pontos.push(`${ponto.x.toFixed(1)} ${ponto.y.toFixed(1)}`);
    }
    return 'M' + pontos.join(' L');
  }

  window.XP500.decisoes = {
    prepararPainelDecisao,
    verificarBifurcacao,
    exibirDecisao,
    selecionarCaminho,
    ocultarDecisao,
    definirModoAutomatico,
    estaNoModoAutomatico,
  };
})();
