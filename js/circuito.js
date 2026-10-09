/**
 * circuito.js
 * Configuração do circuito XP500 (segmentos, conexões, agulhas, áreas e
 * velocidade) e funções de consulta da topologia.
 *
 * COMO O CIRCUITO É MODELADO
 * - Segmento: trecho contínuo de trilho entre dois nós. Cada segmento tem um
 *   "inicio" e um "fim" (as extremidades) e um traçado SVG que segue o eixo
 *   central do trilho original. O trem anda sobre esse traçado com
 *   getPointAtLength(), nos dois sentidos.
 * - Nó: ponto onde segmentos se encontram. Pode ser:
 *     • "agulha": tem uma "ponta" (lado único) e dois ou mais "caminhos".
 *       Chegando pela ponta, o usuário escolhe o caminho; chegando por um
 *       caminho, o trem segue automaticamente para a ponta.
 *     • "fim-de-linha": para-choque. A ação "inverter" volta o trem pelo
 *       mesmo segmento; "parar" interrompe a movimentação.
 * - Cruzamento: duas linhas que se cruzam SEM conexão. Não é nó: os segmentos
 *   simplesmente passam por ali e o trem segue no trajeto atual. A lista
 *   "cruzamentos" serve apenas para documentação e para as áreas interativas.
 *
 * Os traçados foram extraídos da geometria de assets/xp-500.svg pelo script
 * ferramentas/gerar_tracados.py (o SVG original é exibido sem alterações).
 */
window.XP500 = window.XP500 || {};

(function () {
  'use strict';

  const CONFIGURACAO_CIRCUITO = {
    /** Dimensões do viewBox do SVG original. */
    dimensoes: { largura: 1661, altura: 947 },

    /** Velocidade em unidades do desenho (px do viewBox) por segundo. */
    velocidade: { minima: 20, maxima: 400, inicial: 140, passo: 10, unidade: 'px/s' },

    /**
     * Aparência da pista, desenhada sobre os traçados-guia (eixo dos trilhos).
     * O trilho do SVG original tem cerca de 22 de largura; aqui ele fica mais fino.
     */
    pista: { larguraTrilho: 14, cor: '#1d2329' },

    /** Decisões nas agulhas: "automatica" = o sistema sorteia o caminho sem parar o trem. */
    modoDecisaoInicial: 'automatica',

    /**
     * Composição do trem: locomotiva + vagões (na ordem, a partir da locomotiva).
     * Medidas em unidades do desenho. A largura é maior que a do trilho para o trem se destacar.
     */
    trem: {
      espacamento: 6,
      largura: 22,
      locomotiva: { comprimento: 40, cor: '#000000' },
      vagoes: [
        { comprimento: 32, cor: '#000000' },
        { comprimento: 32, cor: '#7b4a23' },
        { comprimento: 32, cor: '#f5c400' },
      ],
    },

    /** Onde a frente do trem começa e em que sentido anda (1 = do início para o fim). */
    posicaoInicial: { segmento: 'oeste', distancia: 200, sentido: 1 },

    /** Distância, antes de uma agulha, em que o trem para à espera da decisão. */
    distanciaParadaAntesDaAgulha: 34,

    segmentos: {
      principal: {
        nome: 'Linha principal',
        inicio: 'agulha-norte',
        fim: 'agulha-sul',
        tracado: 'M456.0 72.0 L464.0 72.0 L472.0 71.9 L480.0 71.8 L488.0 71.7 L496.0 71.5 L504.0 71.4 L512.0 71.2 L520.0 71.1 L528.0 71.0 L536.0 71.0 L544.0 71.0 L552.0 71.0 L560.0 71.0 L568.0 71.0 L576.0 71.0 L584.0 71.0 L592.0 71.0 L600.0 70.9 L608.0 70.7 L616.0 70.5 L624.0 70.5 L632.0 70.5 L640.0 70.5 L648.0 70.5 L656.0 70.5 L664.0 70.5 L672.0 70.5 L680.0 70.5 L688.0 70.5 L696.0 70.5 L704.0 70.5 L712.0 70.5 L720.0 70.5 L728.0 70.5 L736.0 70.5 L744.0 70.5 L752.0 70.5 L760.0 70.5 L768.0 70.5 L776.0 70.5 L784.0 70.5 L792.0 70.5 L800.0 70.5 L808.0 70.5 L816.0 70.6 L824.0 70.8 L832.0 71.0 L840.0 71.0 L848.0 71.0 L856.0 71.0 L864.0 71.0 L872.0 71.0 L880.0 71.0 L888.0 71.0 L896.0 71.0 L904.0 71.0 L912.0 71.0 L920.0 71.0 L928.0 71.0 L936.0 71.0 L944.0 71.0 L952.0 71.0 L960.0 71.0 L968.0 71.0 L976.0 71.0 L984.0 71.0 L992.0 71.0 L1000.0 71.0 L1008.0 71.0 L1016.0 71.2 L1024.0 71.4 L1032.0 71.5 L1040.0 71.5 L1048.0 71.5 L1056.0 71.5 L1064.0 71.5 L1072.0 71.5 L1080.0 71.5 L1088.0 71.5 L1096.0 71.5 L1104.0 71.5 L1112.0 71.5 L1120.0 71.8 L1128.0 72.1 L1136.0 72.5 L1143.9 72.9 L1151.9 73.6 L1159.8 74.6 L1167.7 76.0 L1175.5 77.7 L1183.3 79.8 L1190.9 82.2 L1198.5 84.8 L1206.0 87.6 L1213.4 90.6 L1220.6 94.0 L1227.7 97.7 L1234.8 101.5 L1241.7 105.5 L1248.4 109.8 L1255.0 114.3 L1261.5 119.0 L1267.8 123.9 L1273.8 129.2 L1279.6 134.7 L1285.3 140.3 L1290.8 146.1 L1296.3 152.0 L1301.6 158.0 L1306.6 164.2 L1311.3 170.7 L1315.8 177.3 L1320.2 184.0 L1324.3 190.8 L1328.3 197.8 L1331.9 204.9 L1335.3 212.1 L1338.5 219.4 L1341.7 226.8 L1344.6 234.3 L1347.1 241.9 L1349.3 249.5 L1351.2 257.3 L1352.9 265.1 L1354.5 273.0 L1355.8 280.9 L1356.7 288.8 L1357.5 296.8 L1357.9 304.8 L1358.0 312.8 L1358.0 320.8 L1357.8 328.8 L1357.5 336.8 L1356.9 344.7 L1356.2 352.7 L1355.6 360.7 L1354.8 368.6 L1351.8 376.0 L1348.0 383.0 L1346.2 390.8 L1344.5 398.6 L1342.2 406.3 L1339.3 413.7 L1336.0 421.0 L1332.5 428.2 L1328.8 435.3 L1325.0 442.3 L1320.8 449.2 L1316.4 455.8 L1311.9 462.4 L1307.0 468.8 L1302.0 475.0 L1296.9 481.1 L1291.4 487.0 L1285.7 492.6 L1279.9 498.1 L1273.9 503.4 L1267.8 508.5 L1261.5 513.4 L1255.0 518.1 L1248.3 522.6 L1241.6 526.9 L1234.7 531.0 L1227.7 534.9 L1220.6 538.4 L1213.2 541.7 L1205.9 544.8 L1198.4 547.7 L1190.9 550.3 L1183.2 552.5 L1175.4 554.6 L1167.7 556.5 L1159.8 558.1 L1151.9 559.4 L1144.0 560.4 L1136.0 561.0 L1128.1 561.5 L1120.1 561.9 L1112.1 562.0 L1104.1 562.0 L1096.1 561.9 L1088.1 561.6 L1080.1 561.1 L1072.1 560.6 L1064.1 559.7 L1056.2 558.5 L1048.4 557.1 L1040.6 555.3 L1032.8 553.3 L1025.2 551.0 L1017.6 548.3 L1010.2 545.4 L1002.8 542.4 L995.4 539.2 L988.3 535.7 L981.2 531.8 L974.4 527.7 L967.7 523.3 L961.2 518.7 L954.7 513.9 L948.4 509.1 L942.1 504.1 L936.0 499.0 L929.9 493.7 L923.9 488.4 L917.8 483.2 L911.7 478.2 L905.3 473.3 L898.8 468.6 L892.2 464.2 L885.3 460.1 L878.3 456.2 L871.2 452.5 L864.0 449.0 L856.7 445.8 L849.2 443.1 L841.5 440.7 L833.8 438.5 L826.1 436.7 L818.2 435.3 L810.2 434.5 L802.2 434.0 L794.2 433.8 L786.2 433.5 L778.2 433.5 L770.2 433.5 L762.2 433.5 L754.2 433.5 L746.2 433.5 L738.2 433.5 L730.2 433.5 L722.2 433.5 L714.2 433.5 L706.2 433.5 L698.2 433.5 L690.2 433.5 L682.2 433.5 L674.2 433.5 L666.2 433.5 L658.2 433.5 L650.2 433.5 L642.2 433.5 L634.2 433.5 L626.2 433.5 L618.2 433.5 L610.2 433.5 L602.2 433.5 L594.2 433.5 L586.2 433.5 L578.2 433.5 L570.2 433.5 L562.2 433.5 L554.2 433.5 L546.2 433.5 L538.2 433.5 L530.2 433.5 L522.2 433.5 L514.2 433.5 L506.2 433.5 L498.2 433.5 L490.2 433.5 L482.2 433.5 L474.2 433.5 L466.2 433.5 L458.2 433.5 L450.2 433.5 L442.2 433.5 L434.2 433.5 L426.2 433.5 L418.2 433.5 L410.2 433.5 L402.2 433.5 L394.2 433.5 L386.2 433.5 L378.2 433.5 L370.2 433.5 L362.2 433.5 L354.2 433.5 L346.2 433.5 L338.2 433.5 L330.2 433.5 L322.2 433.5 L314.2 433.5 L306.2 433.7 L298.2 433.9 L290.2 434.1 L282.3 434.4 L274.3 434.8 L266.3 435.3 L258.3 436.2 L250.4 437.4 L242.6 439.0 L234.9 441.2 L227.3 443.7 L219.8 446.6 L212.5 449.8 L205.3 453.3 L198.2 457.0 L191.3 461.1 L184.6 465.3 L178.0 469.9 L171.7 474.9 L165.6 480.0 L159.6 485.3 L153.9 490.9 L148.4 496.7 L143.2 502.8 L138.0 508.9 L132.9 515.1 L127.9 521.3 L123.5 527.9 L119.3 534.8 L115.3 541.7 L111.4 548.7 L107.8 555.8 L104.5 563.1 L101.3 570.5 L98.4 577.9 L95.7 585.4 L93.3 593.1 L91.2 600.8 L89.3 608.6 L87.7 616.4 L86.4 624.3 L85.3 632.2 L84.5 640.2 L84.0 648.2 L83.8 656.2 L83.8 664.2 L84.2 672.2 L84.8 680.1 L85.8 688.1 L87.1 696.0 L88.7 703.8 L90.6 711.6 L92.9 719.2 L95.5 726.8 L98.3 734.3 L101.5 741.6 L104.9 748.9 L108.6 756.0 L112.6 762.9 L117.0 769.6 L121.6 776.1 L126.5 782.4 L131.6 788.6 L137.0 794.5 L142.7 800.1 L148.5 805.6 L154.5 810.9 L160.8 815.9 L167.2 820.7 L173.7 825.3 L180.3 829.8 L187.2 833.9 L194.2 837.7 L201.3 841.3 L208.6 844.6 L216.1 847.5 L223.6 850.2 L231.2 852.7 L238.9 855.1 L246.6 857.0 L254.4 858.7 L262.3 860.1 L270.2 861.2 L278.2 862.0 L286.2 862.6 L294.2 863.0 L302.2 863.3 L310.2 863.5 L318.2 863.5 L326.2 863.5 L334.2 863.5 L342.2 863.5 L350.2 863.5 L358.2 863.5 L366.2 863.5 L374.2 863.5 L382.2 863.5 L390.2 863.5 L398.2 863.5 L406.2 863.5 L414.2 863.5 L422.2 863.5 L430.2 863.5 L438.2 863.5 L446.2 863.5 L454.2 863.5 L462.2 863.5 L470.2 863.3 L478.2 863.1 L486.2 863.0 L494.2 863.0 L502.2 863.0 L510.2 863.0 L518.2 863.0 L526.2 863.0 L534.2 863.0 L542.2 863.0 L550.2 863.0 L558.2 863.0 L566.2 863.0 L574.2 863.0 L582.2 863.0 L590.2 863.0 L598.2 863.0 L606.2 863.0 L614.2 863.0 L622.2 863.0 L630.2 862.8 L638.1 862.6 L646.1 862.5 L654.1 862.5 L662.1 862.5 L670.1 862.5 L678.1 862.5 L686.1 862.5 L694.1 862.5 L702.1 862.5 L710.1 862.5 L718.1 862.5 L726.1 862.5 L734.1 862.5 L742.1 862.5 L750.1 862.5 L758.1 862.5 L766.1 862.5 L774.1 862.5 L782.1 862.5 L790.1 862.5 L798.1 862.5 L806.1 862.5 L814.1 862.5 L822.1 862.5 L830.1 862.5 L838.1 862.5 L846.1 862.5 L854.1 862.5 L862.1 862.5 L870.1 862.5 L878.1 862.5 L886.1 862.5 L894.1 862.5 L902.1 862.5 L910.1 862.5 L918.1 862.5 L926.1 862.5 L934.1 862.5 L942.1 862.5 L950.1 862.5 L958.1 862.5 L966.1 862.5 L974.1 862.5 L982.1 862.5 L990.1 862.5 L998.1 862.4 L1006.1 862.4 L1014.1 862.3 L1022.1 862.2 L1030.1 862.1 L1038.1 862.1 L1046.1 862.0 L1054.1 862.0 L1058.0 862.0',
      },
      oeste: {
        nome: 'Linha oeste',
        inicio: 'agulha-norte',
        fim: 'agulha-central',
        tracado: 'M456.0 72.0 L448.0 72.0 L440.0 71.9 L432.0 71.9 L424.0 71.8 L416.0 71.8 L408.0 71.7 L400.0 71.6 L392.0 71.6 L384.0 71.5 L376.0 71.5 L368.0 71.5 L360.0 71.5 L352.0 71.5 L344.0 71.5 L336.0 71.5 L328.0 71.5 L320.0 71.5 L312.0 71.5 L304.0 71.6 L296.0 71.8 L288.0 72.0 L280.0 72.1 L272.0 72.6 L264.1 73.3 L256.1 74.2 L248.2 75.3 L240.3 76.7 L232.5 78.5 L224.8 80.6 L217.1 82.8 L209.5 85.4 L202.0 88.2 L194.6 91.1 L187.3 94.4 L180.1 98.0 L173.1 101.7 L166.1 105.7 L159.3 109.9 L152.7 114.3 L146.1 118.9 L139.7 123.7 L133.4 128.7 L127.3 133.9 L121.4 139.3 L115.8 144.9 L110.3 150.7 L104.9 156.6 L99.7 162.7 L94.8 169.0 L90.0 175.4 L85.3 181.9 L80.9 188.6 L76.7 195.4 L72.8 202.4 L69.2 209.5 L65.7 216.7 L62.4 224.0 L59.3 231.4 L56.5 238.9 L54.1 246.5 L51.7 254.2 L49.6 261.9 L47.8 269.7 L46.3 277.5 L45.1 285.4 L44.0 293.3 L43.3 301.3 L42.9 309.3 L42.6 317.3 L42.7 325.3 L43.0 333.3 L43.5 341.3 L44.3 349.2 L45.3 357.2 L46.5 365.1 L48.2 372.9 L50.1 380.7 L52.2 388.4 L54.5 396.0 L57.1 403.6 L59.9 411.1 L63.0 418.5 L66.3 425.8 L69.9 432.9 L73.6 440.0 L77.6 447.0 L81.8 453.8 L86.3 460.4 L90.9 466.9 L95.7 473.3 L100.6 479.6 L105.9 485.6 L111.3 491.6 L116.8 497.3 L122.6 502.8 L128.6 508.1 L134.1 513.9 L139.9 519.5 L146.4 524.0 L153.1 528.5 L159.6 533.2 L166.2 537.6 L173.1 541.7 L180.0 545.7 L187.2 549.3 L194.5 552.6 L201.9 555.5 L209.6 557.6 L217.5 558.8 L225.5 559.6 L233.5 560.0 L241.5 560.0 L249.5 560.0 L257.5 560.0 L265.5 560.0 L273.5 560.0 L281.5 560.0 L289.5 560.0 L297.5 560.0 L305.5 560.0 L313.5 560.0 L321.5 560.0 L329.5 560.0 L337.5 560.0 L345.5 560.0 L353.5 560.0 L361.5 560.0 L369.5 560.0 L372.0 560.0',
      },
      'diagonal-norte': {
        nome: 'Diagonal norte',
        inicio: 'agulha-norte',
        fim: 'agulha-sul',
        tracado: 'M456.0 72.0 L463.9 72.9 L471.5 75.6 L478.4 79.5 L484.8 84.3 L490.8 89.6 L496.6 95.1 L502.2 100.8 L507.9 106.4 L513.8 111.9 L520.0 116.9 L526.6 121.4 L533.2 125.9 L539.9 130.4 L546.5 134.8 L553.1 139.3 L559.8 143.8 L566.3 148.4 L572.6 153.3 L578.9 158.3 L585.2 163.2 L591.4 168.2 L597.5 173.4 L603.6 178.5 L609.8 183.6 L616.1 188.5 L622.6 193.3 L629.2 197.8 L635.9 202.1 L642.8 206.2 L649.8 210.0 L657.0 213.6 L664.3 216.8 L671.7 219.8 L679.2 222.5 L686.9 224.8 L694.7 226.8 L702.4 228.6 L710.3 230.1 L718.2 231.0 L726.2 231.7 L734.2 232.0 L742.2 232.1 L750.2 232.4 L758.2 232.5 L766.2 232.3 L774.2 232.1 L782.2 232.0 L790.2 232.0 L798.2 232.0 L806.2 232.0 L814.2 232.0 L822.2 232.0 L830.2 232.0 L838.2 232.2 L846.2 232.7 L854.2 233.4 L862.1 234.1 L870.1 235.2 L877.9 236.7 L885.7 238.6 L893.4 240.8 L901.0 243.3 L908.5 245.9 L916.0 248.8 L923.4 251.9 L930.6 255.3 L937.7 259.0 L944.6 263.0 L951.4 267.2 L958.0 271.7 L964.5 276.5 L970.7 281.4 L976.9 286.5 L982.9 291.8 L988.7 297.3 L994.4 302.9 L1000.2 308.5 L1006.0 313.9 L1012.0 319.3 L1018.0 324.5 L1024.2 329.6 L1030.5 334.5 L1037.1 339.0 L1043.9 343.3 L1050.8 347.3 L1057.8 351.1 L1065.0 354.6 L1072.4 357.8 L1079.8 360.7 L1087.3 363.5 L1095.0 365.8 L1102.7 368.0 L1110.4 369.9 L1118.3 371.6 L1126.1 373.0 L1134.1 374.0 L1142.0 374.6 L1150.0 374.9 L1158.0 375.0 L1166.0 375.2 L1174.0 375.4 L1182.0 375.5 L1190.0 375.5 L1198.0 375.5 L1206.0 375.5 L1214.0 375.5 L1222.0 375.5 L1230.0 375.5 L1238.0 375.5 L1246.0 375.5 L1254.0 375.5 L1262.0 375.5 L1270.0 375.6 L1278.0 375.9 L1286.0 376.0 L1294.0 376.0 L1302.0 376.0 L1310.0 376.0 L1318.0 376.0 L1326.0 376.0 L1334.0 376.0 L1342.0 376.3 L1350.0 376.7 L1358.0 377.1 L1366.0 377.7 L1373.9 378.4 L1381.9 379.5 L1389.7 381.0 L1397.5 382.7 L1405.3 384.7 L1413.0 386.9 L1420.6 389.4 L1428.1 392.2 L1435.5 395.1 L1442.9 398.1 L1450.2 401.5 L1457.3 405.1 L1464.4 408.9 L1471.3 412.9 L1478.0 417.3 L1484.6 421.8 L1491.1 426.5 L1497.5 431.3 L1503.7 436.3 L1509.7 441.5 L1515.5 447.1 L1521.2 452.7 L1526.7 458.5 L1532.1 464.5 L1537.2 470.6 L1542.1 477.0 L1546.7 483.4 L1551.2 490.1 L1555.5 496.8 L1559.6 503.7 L1563.5 510.7 L1567.2 517.8 L1570.6 525.0 L1573.7 532.4 L1576.6 539.8 L1579.3 547.4 L1581.7 555.0 L1583.8 562.7 L1585.8 570.5 L1587.5 578.3 L1589.1 586.1 L1590.4 594.0 L1591.4 601.9 L1592.2 609.9 L1592.7 617.9 L1593.0 625.9 L1592.9 633.9 L1592.6 641.9 L1592.1 649.9 L1591.4 657.8 L1590.4 665.8 L1589.0 673.7 L1587.5 681.5 L1585.7 689.3 L1583.7 697.1 L1581.3 704.7 L1578.6 712.2 L1575.7 719.7 L1572.6 727.0 L1569.3 734.3 L1565.8 741.5 L1561.9 748.5 L1557.9 755.4 L1553.5 762.1 L1549.0 768.7 L1544.3 775.2 L1539.3 781.5 L1534.2 787.6 L1528.8 793.5 L1523.1 799.2 L1517.3 804.7 L1511.4 810.0 L1505.2 815.1 L1498.9 820.0 L1492.4 824.7 L1485.7 829.1 L1478.9 833.3 L1472.0 837.3 L1464.9 840.9 L1457.6 844.3 L1450.3 847.5 L1442.8 850.4 L1435.2 853.0 L1427.6 855.4 L1419.9 857.6 L1412.1 859.4 L1404.2 860.5 L1396.2 860.9 L1388.2 861.0 L1380.2 861.2 L1372.2 861.4 L1364.2 861.5 L1356.2 861.5 L1348.2 861.5 L1340.2 861.5 L1332.2 861.6 L1324.2 861.8 L1316.2 862.0 L1308.2 862.0 L1300.2 862.0 L1292.2 862.0 L1284.2 862.0 L1276.2 862.0 L1268.2 862.0 L1260.2 862.0 L1252.2 862.0 L1244.2 862.0 L1236.2 862.0 L1228.2 862.0 L1220.2 862.0 L1212.2 862.0 L1204.2 862.0 L1196.2 862.0 L1188.2 862.0 L1180.2 862.2 L1172.3 862.4 L1164.3 862.5 L1156.3 862.5 L1148.3 862.5 L1140.3 862.5 L1132.3 862.5 L1124.3 862.5 L1116.3 862.4 L1108.3 862.3 L1100.3 862.3 L1092.3 862.2 L1084.3 862.1 L1076.3 862.1 L1068.3 862.0 L1060.3 862.0 L1058.0 862.0',
      },
      'diagonal-sul': {
        nome: 'Diagonal sul',
        inicio: 'agulha-central',
        fim: 'agulha-sul',
        tracado: 'M372.0 560.0 L379.9 561.0 L387.3 564.0 L394.0 568.4 L400.0 573.7 L405.5 579.6 L410.7 585.6 L415.8 591.8 L420.9 597.9 L426.3 603.8 L432.2 609.3 L438.4 614.2 L444.8 619.1 L451.1 624.0 L457.4 629.0 L463.7 633.9 L470.0 638.8 L476.3 643.7 L482.7 648.6 L489.0 653.5 L495.3 658.4 L501.5 663.4 L507.8 668.4 L514.1 673.3 L520.4 678.2 L526.8 683.0 L533.2 687.8 L539.8 692.4 L546.5 696.8 L553.4 700.8 L560.4 704.6 L567.5 708.3 L574.8 711.7 L582.2 714.7 L589.6 717.6 L597.2 720.3 L604.8 722.6 L612.6 724.6 L620.4 726.4 L628.2 727.8 L636.2 728.9 L644.1 729.7 L652.1 730.2 L660.1 730.5 L668.1 730.8 L676.1 731.0 L684.1 730.9 L692.1 730.7 L700.1 730.5 L708.1 730.4 L716.1 730.1 L724.1 729.8 L732.1 729.5 L740.1 729.2 L748.1 728.9 L756.1 728.5 L764.0 728.2 L772.0 727.9 L780.0 727.6 L788.0 727.6 L796.0 727.9 L804.0 728.2 L812.0 728.8 L820.0 729.6 L827.9 730.5 L835.8 731.6 L843.7 732.9 L851.5 734.7 L859.3 736.6 L867.0 738.6 L874.7 741.0 L882.3 743.5 L889.8 746.2 L897.3 748.9 L904.8 751.7 L912.1 755.0 L919.3 758.5 L926.4 762.2 L933.5 766.0 L940.4 769.9 L947.3 774.0 L954.2 778.1 L961.0 782.3 L967.6 786.7 L974.2 791.3 L980.7 796.0 L987.1 800.8 L993.4 805.7 L999.6 810.7 L1005.3 816.3 L1010.5 822.4 L1015.5 828.7 L1020.3 835.0 L1025.3 841.3 L1030.5 847.4 L1036.2 853.0 L1042.7 857.7 L1050.0 860.9 L1057.9 862.0 L1058.0 862.0',
      },
      ramal: {
        nome: 'Ramal sem saída',
        inicio: 'agulha-central',
        fim: 'para-choque',
        tracado: 'M372.0 560.0 L380.0 560.0 L388.0 560.0 L396.0 560.0 L404.0 560.0 L412.0 560.0 L420.0 560.0 L428.0 560.0 L436.0 560.0 L444.0 560.0 L452.0 560.0 L460.0 560.0 L468.0 560.0 L476.0 560.0 L484.0 560.0 L492.0 560.0 L500.0 560.0 L508.0 560.0 L516.0 560.0 L524.0 560.0 L532.0 560.0 L540.0 560.0 L548.0 560.0 L556.0 560.0 L564.0 560.0 L572.0 560.0 L580.0 560.0 L588.0 560.0 L596.0 560.0 L604.0 560.0 L612.0 560.1 L620.0 560.4 L628.0 560.5 L636.0 560.5 L644.0 560.5 L652.0 560.4 L660.0 560.1 L668.0 560.0 L676.0 560.0 L684.0 560.0 L692.0 560.0 L700.0 560.0 L708.0 560.0 L716.0 560.0 L724.0 560.0 L732.0 560.0 L740.0 560.0 L748.0 560.0 L756.0 560.0 L764.0 560.2 L772.0 560.4 L780.0 560.5 L788.0 560.5 L796.0 560.5 L804.0 560.5 L812.0 560.5 L820.0 560.5 L828.0 560.7 L836.0 561.1 L843.9 561.9 L851.8 563.1 L859.7 564.8 L867.3 567.1 L874.8 569.9 L882.3 572.7 L889.8 575.6 L897.2 578.5 L904.7 581.4 L912.1 584.3 L919.6 587.1 L927.1 590.0 L934.6 592.8 L942.0 595.7 L949.5 598.6 L957.0 601.4 L964.4 604.3 L971.9 607.1 L979.4 610.0 L986.8 612.9 L994.3 615.8 L1001.8 618.6 L1009.3 621.5 L1016.7 624.3 L1024.2 627.2 L1031.7 630.1 L1039.1 632.9 L1046.6 635.8 L1054.1 638.6 L1061.6 641.5 L1069.0 644.4 L1076.5 647.2 L1084.0 650.0 L1091.5 652.8 L1099.0 655.7 L1106.4 658.5 L1113.9 661.3 L1121.4 664.1 L1128.9 667.0 L1136.3 669.9 L1143.8 672.9 L1151.2 675.9 L1152.5 676.5',
      },
    },

    nos: {
      'agulha-norte': {
        tipo: 'agulha',
        nome: 'Agulha Norte',
        posicao: { x: 456, y: 72 },
        ponta: { segmento: 'oeste', extremidade: 'inicio' },
        caminhoPadrao: 'A',
        caminhos: [
          { id: 'A', rotulo: 'Reta Norte', descricao: 'Segue pela reta superior até a curva nordeste.', segmento: 'principal', extremidade: 'inicio' },
          { id: 'B', rotulo: 'Diagonal Norte', descricao: 'Desvia pela serpentina norte até a curva leste.', segmento: 'diagonal-norte', extremidade: 'inicio' },
        ],
      },
      'agulha-central': {
        tipo: 'agulha',
        nome: 'Agulha Central',
        posicao: { x: 372, y: 560 },
        ponta: { segmento: 'oeste', extremidade: 'fim' },
        caminhoPadrao: 'B',
        caminhos: [
          { id: 'A', rotulo: 'Ramal sem saída', descricao: 'Segue reto até o para-choque e retorna.', segmento: 'ramal', extremidade: 'inicio' },
          { id: 'B', rotulo: 'Diagonal Sul', descricao: 'Desvia pela serpentina sul até a reta sul.', segmento: 'diagonal-sul', extremidade: 'inicio' },
        ],
      },
      'agulha-sul': {
        tipo: 'agulha',
        nome: 'Agulha Sul',
        posicao: { x: 1058, y: 862 },
        ponta: { segmento: 'diagonal-norte', extremidade: 'fim' },
        caminhoPadrao: 'A',
        caminhos: [
          { id: 'A', rotulo: 'Reta Sul', descricao: 'Segue pela reta inferior até a curva oeste.', segmento: 'principal', extremidade: 'fim' },
          { id: 'B', rotulo: 'Diagonal Sul', descricao: 'Desvia pela serpentina sul até a Agulha Central.', segmento: 'diagonal-sul', extremidade: 'fim' },
        ],
      },
      'para-choque': {
        tipo: 'fim-de-linha',
        nome: 'Para-choque do ramal',
        posicao: { x: 1152.5, y: 676.5 },
        acao: 'inverter',
      },
    },

    /** Cruzamentos sem conexão: o trem nunca muda de segmento nesses pontos. */
    cruzamentos: [
      { id: 'cruzamento-oeste', segmentos: ['principal', 'oeste'], posicao: { x: 134, y: 513.8 } },
      { id: 'cruzamento-leste', segmentos: ['principal', 'diagonal-norte'], posicao: { x: 1351.4, y: 376.7 } },
    ],

    /**
     * Áreas interativas (destacadas ao passar o mouse).
     * - tipo "trecho": parte de um segmento, de "de" até "ate" (frações 0–1 do comprimento).
     * - tipo "ponto": círculo de raio "raio" em torno de "posicao"; "categoria" indica o que
   *   há ali ("agulha", "cruzamento" ou "fim-de-linha") e define o texto do tooltip.
     * As áreas de ponto têm prioridade sobre os trechos ao identificar a área atual.
     */
    areas: [
      { id: 'reta-norte', nome: 'Reta Norte', tipo: 'trecho', segmento: 'principal', de: 0, ate: 0.185 },
      { id: 'curva-nordeste', nome: 'Curva Nordeste', tipo: 'trecho', segmento: 'principal', de: 0.185, ate: 0.297 },
      { id: 'curva-leste-interna', nome: 'Curva Leste Interna', tipo: 'trecho', segmento: 'principal', de: 0.297, ate: 0.39 },
      { id: 'serpentina-central', nome: 'Serpentina Central', tipo: 'trecho', segmento: 'principal', de: 0.39, ate: 0.476 },
      { id: 'reta-central', nome: 'Reta Central', tipo: 'trecho', segmento: 'principal', de: 0.476, ate: 0.624 },
      { id: 'curva-oeste-inferior', nome: 'Curva Oeste Inferior', tipo: 'trecho', segmento: 'principal', de: 0.624, ate: 0.797 },
      { id: 'reta-sul', nome: 'Reta Sul', tipo: 'trecho', segmento: 'principal', de: 0.797, ate: 1 },

      { id: 'reta-norte-oeste', nome: 'Reta Norte (trecho oeste)', tipo: 'trecho', segmento: 'oeste', de: 0, ate: 0.179 },
      { id: 'curva-oeste-superior', nome: 'Curva Oeste Superior', tipo: 'trecho', segmento: 'oeste', de: 0.179, ate: 0.849 },
      { id: 'acesso-agulha-central', nome: 'Acesso à Agulha Central', tipo: 'trecho', segmento: 'oeste', de: 0.849, ate: 1 },

      { id: 'diagonal-norte', nome: 'Diagonal Norte', tipo: 'trecho', segmento: 'diagonal-norte', de: 0, ate: 0.153 },
      { id: 'serpentina-norte', nome: 'Serpentina Norte', tipo: 'trecho', segmento: 'diagonal-norte', de: 0.153, ate: 0.38 },
      { id: 'ligacao-leste', nome: 'Reta de Ligação Leste', tipo: 'trecho', segmento: 'diagonal-norte', de: 0.38, ate: 0.517 },
      { id: 'curva-leste', nome: 'Curva Leste', tipo: 'trecho', segmento: 'diagonal-norte', de: 0.517, ate: 0.834 },
      { id: 'reta-sul-leste', nome: 'Reta Sul (trecho leste)', tipo: 'trecho', segmento: 'diagonal-norte', de: 0.834, ate: 1 },

      { id: 'diagonal-sul', nome: 'Diagonal Sul', tipo: 'trecho', segmento: 'diagonal-sul', de: 0, ate: 0.408 },
      { id: 'serpentina-sul', nome: 'Serpentina Sul', tipo: 'trecho', segmento: 'diagonal-sul', de: 0.408, ate: 1 },

      { id: 'linha-ramal', nome: 'Linha do Ramal', tipo: 'trecho', segmento: 'ramal', de: 0, ate: 0.599 },
      { id: 'ramal-sem-saida', nome: 'Ramal sem Saída', tipo: 'trecho', segmento: 'ramal', de: 0.599, ate: 1 },

      { id: 'area-agulha-norte', nome: 'Agulha Norte (bifurcação)', tipo: 'ponto', categoria: 'agulha', posicao: { x: 456, y: 72 }, raio: 28 },
      { id: 'area-agulha-central', nome: 'Agulha Central (bifurcação)', tipo: 'ponto', categoria: 'agulha', posicao: { x: 372, y: 560 }, raio: 28 },
      { id: 'area-agulha-sul', nome: 'Agulha Sul (bifurcação)', tipo: 'ponto', categoria: 'agulha', posicao: { x: 1058, y: 862 }, raio: 28 },
      { id: 'area-cruzamento-oeste', nome: 'Cruzamento Oeste (sem conexão)', tipo: 'ponto', categoria: 'cruzamento', posicao: { x: 134, y: 513.8 }, raio: 26 },
      { id: 'area-cruzamento-leste', nome: 'Cruzamento Leste (sem conexão)', tipo: 'ponto', categoria: 'cruzamento', posicao: { x: 1351.4, y: 376.7 }, raio: 26 },
      { id: 'area-para-choque', nome: 'Para-choque (fim de linha)', tipo: 'ponto', categoria: 'fim-de-linha', posicao: { x: 1152.5, y: 676.5 }, raio: 24 },
    ],
  };

  const NS_SVG = 'http://www.w3.org/2000/svg';

  /** Elementos <path> e comprimentos dos segmentos, preenchidos por montarTracados(). */
  const geometriaSegmentos = {};

  /**
   * Cria um <path> invisível para cada segmento, usado nos cálculos geométricos.
   * @param {SVGGElement} grupo Grupo SVG que receberá os traçados-guia.
   */
  function montarTracados(grupo) {
    Object.entries(CONFIGURACAO_CIRCUITO.segmentos).forEach(([segmentoId, segmento]) => {
      const caminho = document.createElementNS(NS_SVG, 'path');
      caminho.setAttribute('d', segmento.tracado);
      caminho.setAttribute('class', 'tracado-guia');
      caminho.dataset.segmento = segmentoId;
      grupo.appendChild(caminho);
      geometriaSegmentos[segmentoId] = { elemento: caminho, comprimento: caminho.getTotalLength() };
    });
  }

  /**
   * Retorna o ponto do traçado de um segmento a uma distância do seu início.
   * @param {string} segmentoId
   * @param {number} distancia Distância a partir do início (limitada ao comprimento).
   * @returns {{x:number, y:number}}
   */
  function obterPontoNoSegmento(segmentoId, distancia) {
    const geometria = geometriaSegmentos[segmentoId];
    const limitada = Math.min(Math.max(distancia, 0), geometria.comprimento);
    const ponto = geometria.elemento.getPointAtLength(limitada);
    return { x: ponto.x, y: ponto.y };
  }

  /** @returns {number} Comprimento do segmento (0 se não existir). */
  function obterComprimento(segmentoId) {
    return geometriaSegmentos[segmentoId] ? geometriaSegmentos[segmentoId].comprimento : 0;
  }

  function obterSegmento(segmentoId) {
    return CONFIGURACAO_CIRCUITO.segmentos[segmentoId] || null;
  }

  function obterNo(noId) {
    return CONFIGURACAO_CIRCUITO.nos[noId] || null;
  }

  /** Compara duas referências {segmento, extremidade}. */
  function mesmaExtremidade(referenciaA, referenciaB) {
    return referenciaA.segmento === referenciaB.segmento && referenciaA.extremidade === referenciaB.extremidade;
  }

  /**
   * Lista para onde o trem pode seguir ao chegar a um nó.
   * Regras: chegando pela ponta de uma agulha → todos os caminhos;
   * chegando por um caminho → apenas a ponta; chegada desconhecida → nenhuma saída.
   * @param {string} noId
   * @param {{segmento:string, extremidade:string}} chegada Extremidade pela qual o trem chegou.
   * @returns {Array<{id?:string, segmento:string, extremidade:string}>}
   */
  function listarSaidas(noId, chegada) {
    const no = obterNo(noId);
    if (!no || no.tipo !== 'agulha') return [];
    if (mesmaExtremidade(no.ponta, chegada)) return no.caminhos;
    const veioDeUmCaminho = no.caminhos.some((caminho) => mesmaExtremidade(caminho, chegada));
    return veioDeUmCaminho ? [no.ponta] : [];
  }

  /** @returns {number} Comprimento total do trem, incluindo os espaços entre os carros. */
  function calcularComprimentoTrem() {
    const { trem } = CONFIGURACAO_CIRCUITO;
    const carros = [trem.locomotiva].concat(trem.vagoes);
    return carros.reduce((total, carro) => total + carro.comprimento, 0) + trem.espacamento * (carros.length - 1);
  }

  /**
   * Confere a coerência entre segmentos e nós e avisa no console sobre
   * referências quebradas (segmento sem conexão válida).
   * @returns {string[]} Lista de problemas encontrados (vazia se tudo estiver certo).
   */
  function validarConfiguracao() {
    const problemas = [];
    const { segmentos, nos, posicaoInicial } = CONFIGURACAO_CIRCUITO;

    Object.entries(segmentos).forEach(([segmentoId, segmento]) => {
      ['inicio', 'fim'].forEach((extremidade) => {
        const noId = segmento[extremidade];
        const no = nos[noId];
        if (!no) {
          problemas.push(`Segmento "${segmentoId}" (${extremidade}) aponta para o nó inexistente "${noId}".`);
          return;
        }
        if (no.tipo !== 'agulha') return;
        const referencia = { segmento: segmentoId, extremidade };
        const ligado = mesmaExtremidade(no.ponta, referencia) || no.caminhos.some((c) => mesmaExtremidade(c, referencia));
        if (!ligado) problemas.push(`A agulha "${noId}" não declara a extremidade ${extremidade} do segmento "${segmentoId}".`);
      });
    });

    if (!segmentos[posicaoInicial.segmento]) {
      problemas.push(`A posição inicial usa o segmento inexistente "${posicaoInicial.segmento}".`);
    }
    problemas.forEach((problema) => console.warn('[XP500] ' + problema));
    return problemas;
  }

  window.XP500.circuito = {
    configuracao: CONFIGURACAO_CIRCUITO,
    montarTracados,
    obterPontoNoSegmento,
    obterComprimento,
    obterSegmento,
    obterNo,
    listarSaidas,
    mesmaExtremidade,
    calcularComprimentoTrem,
    validarConfiguracao,
  };
})();
