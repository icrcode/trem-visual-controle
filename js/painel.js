/**
 * painel.js — painel lateral: busca (origem/destino), cartões de rota,
 * previsão de chegada, passo a passo, controles e estatísticas da avenida.
 * Só mexe no DOM; as ações vêm de app.js pelos callbacks de prepararPainel().
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  const el = {};
  let temporizadorAviso = null;

  const config = () => window.XP500.configuracaoMapa;
  const $ = (seletor) => document.querySelector(seletor);

  /**
   * @param {Object} acoes {aoIniciar, aoPausar, aoReiniciar, aoCancelarRota,
   *   aoMudarVelocidade(valor), aoMudarVagoes(quantidade), aoSelecionarRota(indice)}
   */
  function prepararPainel(acoes) {
    ['destino', 'cancelar', 'eta', 'etaTempo', 'etaChegada', 'etaDistancia', 'etaBarra', 'rotas', 'passos',
      'iniciar', 'pausar', 'reiniciar', 'menos', 'mais', 'velocidade', 'kmh', 'status', 'carros', 'aguardando',
      'cancelas', 'aviso', 'relogio', 'vagoes', 'vagoesTira', 'menosVagoes', 'maisVagoes'].forEach((nome) => { el[nome] = $(`[data-ui="${nome}"]`); });

    const { velocidade } = window.XP500.circuito.configuracao;
    Object.assign(el.velocidade, { min: velocidade.minima, max: velocidade.maxima, step: velocidade.passo, value: velocidade.inicial });

    el.iniciar.addEventListener('click', acoes.aoIniciar);
    el.pausar.addEventListener('click', acoes.aoPausar);
    el.reiniciar.addEventListener('click', acoes.aoReiniciar);
    el.cancelar.addEventListener('click', acoes.aoCancelarRota);
    el.velocidade.addEventListener('input', () => acoes.aoMudarVelocidade(Number(el.velocidade.value)));
    el.menos.addEventListener('click', () => acoes.aoMudarVelocidade(Number(el.velocidade.value) - 2 * velocidade.passo));
    el.mais.addEventListener('click', () => acoes.aoMudarVelocidade(Number(el.velocidade.value) + 2 * velocidade.passo));
    el.menosVagoes.addEventListener('click', () => acoes.aoMudarVagoes(Number(el.vagoes.value) - 1));
    el.maisVagoes.addEventListener('click', () => acoes.aoMudarVagoes(Number(el.vagoes.value) + 1));
    el.rotas.addEventListener('click', (evento) => {
      const cartao = evento.target.closest('[data-rota]');
      if (cartao) acoes.aoSelecionarRota(Number(cartao.dataset.rota));
    });
    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);
  }

  // ---------- Formatação ----------

  /** Unidades do desenho → "850 m" ou "1,2 km". */
  function formatarDistancia(unidades) {
    const metros = unidades * config().metrosPorUnidade;
    return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
  }

  /** Segundos → "0:42" ou "1:05". */
  function formatarTempo(segundos) {
    const total = Math.max(0, Math.round(segundos));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  /** Horário previsto de chegada → "14:32". */
  function formatarHorario(segundosAFrente) {
    return new Date(Date.now() + segundosAFrente * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function converterParaKmh(unidadesPorSegundo) {
    return Math.round(unidadesPorSegundo * config().metrosPorUnidade * 3.6);
  }

  // ---------- Atualizações ----------

  function atualizarRelogio() {
    el.relogio.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  /** Mostra a velocidade (controle + km/h grande). */
  function atualizarVelocidade(unidadesPorSegundo) {
    el.velocidade.value = unidadesPorSegundo;
    el.kmh.textContent = converterParaKmh(unidadesPorSegundo);
  }

  /**
   * Mostra quantos vagões o trem tem, com uma miniatura colorida da composição.
   * @param {number} quantidade
   * @param {{minimo:number, maximo:number}} limites
   */
  function atualizarVagoes(quantidade, limites) {
    el.vagoes.value = quantidade;
    el.vagoes.textContent = quantidade;
    el.menosVagoes.disabled = quantidade <= limites.minimo;
    el.maisVagoes.disabled = quantidade >= limites.maximo;
    const { trem } = window.XP500.circuito.configuracao;
    el.vagoesTira.replaceChildren(...[trem.locomotiva].concat(trem.vagoes).map((carro, i) => {
      const peca = document.createElement('i');
      peca.style.background = carro.cor;
      if (i === 0) peca.className = 'locomotiva';
      return peca;
    }));
  }

  /** @param {{codigo:string, mensagem:string, emMovimento:boolean}} status */
  function atualizarStatus(status) {
    el.status.textContent = status.mensagem;
    el.status.dataset.estado = status.codigo;
    el.iniciar.disabled = status.emMovimento;
    el.pausar.disabled = !status.emMovimento;
  }

  function definirDestino(nome) {
    el.destino.textContent = nome || 'Clique na pista ou numa estação';
    el.destino.classList.toggle('vazio', !nome);
    el.cancelar.hidden = !nome;
  }

  /**
   * Cartões das rotas alternativas.
   * @param {Array<Object>} rotas
   * @param {number} velocidade unidades/s (para a previsão)
   * @param {number|null} selecionada
   */
  function mostrarRotas(rotas, velocidade, selecionada) {
    el.rotas.replaceChildren(...rotas.map((rota, indice) => {
      const cartao = document.createElement('button');
      cartao.type = 'button';
      cartao.className = 'cartao-rota' + (indice === selecionada ? ' cartao-rota--ativo' : '');
      cartao.dataset.rota = indice;
      const agulhas = rota.decisoes.length;
      cartao.innerHTML = `
        <span class="cartao-tempo"></span>
        <span class="cartao-info"></span>
        <span class="cartao-tag"></span>
        <span class="cartao-ir">${indice === selecionada ? 'EM ROTA' : 'IR →'}</span>`;
      cartao.querySelector('.cartao-tempo').textContent = formatarTempo(rota.comprimento / velocidade);
      cartao.querySelector('.cartao-info').textContent =
        `${formatarDistancia(rota.comprimento)} · ${agulhas} ${agulhas === 1 ? 'agulha' : 'agulhas'}`;
      cartao.querySelector('.cartao-tag').textContent = indice === 0 ? 'Mais rápida' : `+${formatarTempo((rota.comprimento - rotas[0].comprimento) / velocidade)}`;
      return cartao;
    }));
  }

  function limparRotas() {
    el.rotas.replaceChildren();
    el.passos.replaceChildren();
    el.eta.hidden = true;
  }

  /** Lista de instruções passo a passo. */
  function mostrarPassos(passos) {
    el.passos.replaceChildren(...passos.map((passo) => {
      const item = document.createElement('li');
      item.dataset.icone = passo.icone;
      const texto = document.createElement('span');
      texto.textContent = passo.texto;
      item.appendChild(texto);
      if (passo.distancia > 0) {
        const distancia = document.createElement('small');
        distancia.textContent = formatarDistancia(passo.distancia);
        item.appendChild(distancia);
      }
      return item;
    }));
  }

  /** Destaca o passo atual da viagem. */
  function marcarPassoAtual(indice) {
    [...el.passos.children].forEach((item, i) => {
      item.classList.toggle('feito', i < indice);
      item.classList.toggle('atual', i === indice);
    });
  }

  /**
   * Previsão de chegada ao vivo.
   * @param {number} restante unidades
   * @param {number} total unidades
   * @param {number} velocidade unidades/s
   */
  function atualizarPrevisao(restante, total, velocidade) {
    el.eta.hidden = false;
    const segundos = restante / velocidade;
    el.etaTempo.textContent = formatarTempo(segundos);
    el.etaChegada.textContent = `Chegada ${formatarHorario(segundos)}`;
    el.etaDistancia.textContent = formatarDistancia(restante);
    el.etaBarra.style.width = `${(100 * (1 - restante / total)).toFixed(1)}%`;
  }

  function atualizarEstatisticas(estatisticas) {
    el.carros.textContent = estatisticas.carros;
    el.aguardando.textContent = estatisticas.aguardando;
    el.cancelas.textContent = estatisticas.cancelasFechadas;
  }

  /** Mensagem temporária no canto do mapa. */
  function exibirAviso(mensagem) {
    el.aviso.textContent = mensagem;
    el.aviso.classList.add('visivel');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => el.aviso.classList.remove('visivel'), 3200);
  }

  window.XP500.painel = {
    prepararPainel,
    formatarTempo,
    formatarDistancia,
    atualizarVelocidade,
    atualizarVagoes,
    atualizarStatus,
    definirDestino,
    mostrarRotas,
    limparRotas,
    mostrarPassos,
    marcarPassoAtual,
    atualizarPrevisao,
    atualizarEstatisticas,
    exibirAviso,
  };
})();
