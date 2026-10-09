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
 *       mesmo segmento (depois de "pausaAoInverter" segundos parado);
 *       "parar" interrompe a movimentação.
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
        tracado: 'M430.0 72.0 L438.0 72.0 L446.0 71.9 L454.0 71.8 L462.0 71.7 L470.0 71.5 L478.0 71.4 L486.0 71.2 L494.0 71.1 L502.0 71.0 L510.0 71.0 L518.0 71.0 L526.0 71.0 L534.0 71.0 L542.0 71.0 L550.0 71.0 L558.0 71.0 L566.0 71.0 L574.0 71.0 L582.0 71.0 L590.0 71.0 L598.0 71.0 L606.0 70.8 L614.0 70.6 L622.0 70.5 L630.0 70.5 L638.0 70.5 L646.0 70.5 L654.0 70.5 L662.0 70.5 L670.0 70.5 L678.0 70.5 L686.0 70.5 L694.0 70.5 L702.0 70.5 L710.0 70.5 L718.0 70.5 L726.0 70.5 L734.0 70.5 L742.0 70.5 L750.0 70.5 L758.0 70.5 L766.0 70.5 L774.0 70.5 L782.0 70.5 L790.0 70.5 L798.0 70.5 L806.0 70.5 L814.0 70.5 L822.0 70.7 L830.0 70.9 L838.0 71.0 L846.0 71.0 L854.0 71.0 L862.0 71.0 L870.0 71.0 L878.0 71.0 L886.0 71.0 L894.0 71.0 L902.0 71.0 L910.0 71.0 L918.0 71.0 L926.0 71.0 L934.0 71.0 L942.0 71.0 L950.0 71.0 L958.0 71.0 L966.0 71.0 L974.0 71.0 L982.0 71.0 L990.0 71.0 L998.0 71.0 L1006.0 71.0 L1014.0 71.2 L1022.0 71.4 L1030.0 71.5 L1038.0 71.5 L1046.0 71.5 L1054.0 71.5 L1062.0 71.5 L1070.0 71.5 L1078.0 71.5 L1086.0 71.5 L1094.0 71.5 L1102.0 71.5 L1110.0 71.5 L1118.0 71.7 L1126.0 72.0 L1134.0 72.4 L1141.9 72.8 L1149.9 73.4 L1157.9 74.3 L1165.8 75.7 L1173.6 77.3 L1181.3 79.3 L1189.0 81.6 L1196.6 84.1 L1204.1 86.9 L1211.5 89.8 L1218.8 93.1 L1226.0 96.7 L1233.0 100.5 L1240.0 104.4 L1246.7 108.7 L1253.4 113.1 L1259.9 117.8 L1266.2 122.7 L1272.3 127.9 L1278.2 133.3 L1283.9 138.9 L1289.5 144.6 L1294.9 150.5 L1300.3 156.5 L1305.4 162.6 L1310.2 169.0 L1314.7 175.6 L1319.1 182.3 L1323.3 189.1 L1327.3 196.0 L1331.1 203.1 L1334.5 210.3 L1337.8 217.6 L1340.9 225.0 L1343.9 232.4 L1346.5 240.0 L1348.8 247.6 L1350.7 255.4 L1352.4 263.2 L1354.1 271.0 L1355.5 278.9 L1356.5 286.8 L1357.3 294.8 L1357.8 302.8 L1358.0 310.8 L1358.0 318.8 L1357.8 326.8 L1357.5 334.8 L1357.1 342.7 L1356.4 350.7 L1355.8 358.7 L1355.1 366.7 L1352.8 374.3 L1348.7 381.1 L1346.6 388.8 L1345.0 396.7 L1342.8 404.4 L1340.0 411.9 L1336.9 419.2 L1333.4 426.4 L1329.8 433.5 L1326.0 440.6 L1321.9 447.5 L1317.5 454.2 L1313.0 460.8 L1308.3 467.2 L1303.3 473.5 L1298.2 479.6 L1292.8 485.6 L1287.2 491.2 L1281.3 496.7 L1275.4 502.1 L1269.3 507.3 L1263.0 512.2 L1256.6 517.0 L1250.0 521.5 L1243.3 525.8 L1236.4 530.0 L1229.5 533.9 L1222.4 537.6 L1215.1 540.9 L1207.7 544.0 L1200.3 547.0 L1192.8 549.7 L1185.1 552.0 L1177.4 554.1 L1169.6 556.0 L1161.8 557.7 L1153.9 559.1 L1146.0 560.2 L1138.0 560.9 L1130.0 561.4 L1122.1 561.8 L1114.1 562.0 L1106.1 562.0 L1098.1 561.9 L1090.1 561.7 L1082.1 561.5 L1074.1 561.3 L1066.1 561.1 L1058.1 560.5 L1050.2 559.5 L1042.3 558.1 L1034.5 556.3 L1026.8 554.0 L1019.3 551.2 L1012.0 548.1 L1004.8 544.5 L997.9 540.6 L991.1 536.2 L984.6 531.6 L978.1 526.9 L971.6 522.3 L965.1 517.6 L958.6 512.9 L952.1 508.3 L945.6 503.6 L939.1 498.9 L932.7 494.2 L926.2 489.6 L919.7 484.9 L913.2 480.2 L906.7 475.5 L900.2 470.9 L893.7 466.2 L887.2 461.5 L880.6 456.9 L873.9 452.7 L866.9 448.8 L859.6 445.4 L852.2 442.4 L844.7 439.8 L836.9 437.7 L829.1 436.0 L821.2 434.8 L813.3 434.0 L805.3 433.7 L797.3 433.6 L789.3 433.6 L781.3 433.5 L773.3 433.5 L765.3 433.5 L757.3 433.5 L749.3 433.5 L741.3 433.5 L733.3 433.5 L725.3 433.5 L717.3 433.5 L709.3 433.5 L701.3 433.5 L693.3 433.5 L685.3 433.5 L677.3 433.5 L669.3 433.5 L661.3 433.5 L653.3 433.5 L645.3 433.5 L637.3 433.5 L629.3 433.5 L621.3 433.5 L613.3 433.5 L605.3 433.5 L597.3 433.5 L589.3 433.5 L581.3 433.5 L573.3 433.5 L565.3 433.5 L557.3 433.5 L549.3 433.5 L541.3 433.5 L533.3 433.5 L525.3 433.5 L517.3 433.5 L509.3 433.5 L501.3 433.5 L493.3 433.5 L485.3 433.5 L477.3 433.5 L469.3 433.5 L461.3 433.5 L453.3 433.5 L445.3 433.5 L437.3 433.5 L429.3 433.5 L421.3 433.5 L413.3 433.5 L405.3 433.5 L397.3 433.5 L389.3 433.5 L381.3 433.5 L373.3 433.5 L365.3 433.5 L357.3 433.5 L349.3 433.5 L341.3 433.5 L333.3 433.5 L325.3 433.5 L317.3 433.5 L309.3 433.6 L301.3 433.9 L293.3 434.0 L285.3 434.3 L277.3 434.6 L269.3 435.1 L261.3 435.8 L253.4 436.9 L245.5 438.3 L237.8 440.4 L230.2 442.8 L222.6 445.5 L215.3 448.6 L208.0 452.0 L200.9 455.6 L193.9 459.5 L187.1 463.7 L180.5 468.2 L174.1 473.0 L167.9 478.0 L161.8 483.3 L156.0 488.7 L150.5 494.5 L145.1 500.5 L140.0 506.6 L134.8 512.7 L129.8 518.9 L125.1 525.4 L120.8 532.2 L116.8 539.1 L112.8 546.0 L109.1 553.1 L105.7 560.4 L102.5 567.7 L99.5 575.1 L96.7 582.6 L94.2 590.2 L92.0 597.9 L90.0 605.6 L88.3 613.4 L86.8 621.3 L85.7 629.2 L84.8 637.2 L84.2 645.1 L83.9 653.1 L83.8 661.1 L84.0 669.1 L84.5 677.1 L85.4 685.1 L86.6 693.0 L88.0 700.8 L89.8 708.6 L92.0 716.3 L94.5 723.9 L97.2 731.5 L100.2 738.9 L103.6 746.1 L107.1 753.3 L111.0 760.3 L115.3 767.1 L119.9 773.6 L124.7 780.0 L129.6 786.3 L134.9 792.3 L140.5 798.0 L146.3 803.5 L152.2 808.9 L158.4 814.0 L164.8 818.9 L171.2 823.6 L177.8 828.1 L184.6 832.4 L191.5 836.3 L198.6 840.0 L205.9 843.4 L213.3 846.5 L220.8 849.2 L228.4 851.8 L236.0 854.2 L243.7 856.3 L251.5 858.1 L259.3 859.7 L267.2 860.9 L275.2 861.8 L283.2 862.4 L291.1 862.9 L299.1 863.2 L307.1 863.4 L315.1 863.5 L323.1 863.5 L331.1 863.5 L339.1 863.5 L347.1 863.5 L355.1 863.5 L363.1 863.5 L371.1 863.5 L379.1 863.5 L387.1 863.5 L395.1 863.5 L403.1 863.5 L411.1 863.5 L419.1 863.5 L427.1 863.5 L435.1 863.5 L443.1 863.5 L451.1 863.5 L459.1 863.5 L467.1 863.4 L475.1 863.2 L483.1 863.0 L491.1 863.0 L499.1 863.0 L507.1 863.0 L515.1 863.0 L523.1 863.0 L531.1 863.0 L539.1 863.0 L547.1 863.0 L555.1 863.0 L563.1 863.0 L571.1 863.0 L579.1 863.0 L587.1 863.0 L595.1 863.0 L603.1 863.0 L611.1 863.0 L619.1 863.0 L627.1 862.9 L635.1 862.6 L643.1 862.5 L651.1 862.5 L659.1 862.5 L667.1 862.5 L675.1 862.5 L683.1 862.5 L691.1 862.5 L699.1 862.5 L707.1 862.5 L715.1 862.5 L723.1 862.5 L731.1 862.5 L739.1 862.5 L747.1 862.5 L755.1 862.5 L763.1 862.5 L771.1 862.5 L779.1 862.5 L787.1 862.5 L795.1 862.5 L803.1 862.5 L811.1 862.5 L819.1 862.5 L827.1 862.5 L835.1 862.5 L843.1 862.5 L851.1 862.5 L859.1 862.5 L867.1 862.5 L875.1 862.5 L883.1 862.5 L891.1 862.5 L899.1 862.5 L907.1 862.5 L915.1 862.5 L923.1 862.5 L931.1 862.5 L939.1 862.5 L947.1 862.5 L955.1 862.5 L963.1 862.5 L971.1 862.5 L979.1 862.5 L987.1 862.5 L995.1 862.5 L1003.1 862.5 L1011.1 862.5 L1019.1 862.5 L1027.1 862.4 L1035.1 862.4 L1043.1 862.3 L1051.1 862.3 L1059.1 862.2 L1067.1 862.1 L1075.1 862.1 L1083.1 862.0 L1091.1 862.0 L1092.0 862.0',
      },
      oeste: {
        nome: 'Linha oeste',
        inicio: 'agulha-norte',
        fim: 'agulha-central',
        tracado: 'M430.0 72.0 L422.0 72.0 L414.0 71.9 L406.0 71.9 L398.0 71.8 L390.0 71.8 L382.0 71.7 L374.0 71.6 L366.0 71.6 L358.0 71.5 L350.0 71.5 L342.0 71.5 L334.0 71.5 L326.0 71.5 L318.0 71.5 L310.0 71.5 L302.0 71.6 L294.0 71.9 L286.0 72.0 L278.0 72.2 L270.0 72.7 L262.1 73.5 L254.1 74.4 L246.2 75.6 L238.4 77.1 L230.6 79.0 L222.9 81.1 L215.2 83.5 L207.7 86.1 L200.2 88.9 L192.8 91.9 L185.5 95.3 L178.4 98.9 L171.3 102.7 L164.4 106.7 L157.6 111.0 L151.0 115.4 L144.5 120.1 L138.1 124.9 L131.9 130.0 L125.9 135.2 L120.0 140.6 L114.4 146.3 L108.9 152.2 L103.6 158.1 L98.4 164.3 L93.6 170.6 L88.8 177.0 L84.1 183.5 L79.8 190.3 L75.7 197.2 L71.9 204.2 L68.3 211.3 L64.9 218.5 L61.6 225.8 L58.5 233.2 L55.9 240.8 L53.5 248.4 L51.2 256.1 L49.1 263.8 L47.4 271.6 L46.0 279.5 L44.8 287.4 L43.8 295.3 L43.2 303.3 L42.8 311.3 L42.6 319.3 L42.7 327.3 L43.1 335.3 L43.7 343.3 L44.5 351.2 L45.6 359.2 L46.9 367.0 L48.6 374.9 L50.6 382.6 L52.7 390.3 L55.1 397.9 L57.8 405.5 L60.7 413.0 L63.8 420.3 L67.2 427.6 L70.8 434.7 L74.6 441.7 L78.6 448.7 L82.9 455.4 L87.4 462.0 L92.1 468.5 L96.9 474.9 L101.9 481.1 L107.2 487.1 L112.6 493.0 L118.3 498.7 L124.1 504.1 L130.0 509.5 L135.5 515.4 L141.5 520.7 L148.1 525.1 L154.7 529.7 L161.2 534.3 L167.9 538.7 L174.8 542.7 L181.8 546.6 L189.0 550.1 L196.3 553.3 L203.8 556.2 L211.6 558.0 L219.5 559.0 L227.5 559.8 L235.5 560.0 L243.5 560.0 L251.5 560.0 L259.5 560.0 L267.5 560.0 L275.5 560.0 L283.5 560.0 L291.5 560.0 L299.5 560.0 L307.5 560.0 L315.5 560.0 L323.5 560.0 L331.5 560.0 L339.5 560.0 L346.0 560.0',
      },
      'diagonal-norte': {
        nome: 'Diagonal norte',
        inicio: 'agulha-norte',
        fim: 'agulha-sul',
        tracado: 'M430.0 72.0 L438.0 72.3 L445.9 73.4 L453.7 75.2 L461.3 77.7 L468.6 80.9 L475.6 84.8 L482.2 89.3 L488.8 93.9 L495.3 98.5 L501.8 103.2 L508.3 107.8 L514.8 112.5 L521.3 117.1 L527.9 121.7 L534.4 126.4 L540.9 131.0 L547.4 135.7 L553.9 140.3 L560.4 144.9 L567.0 149.6 L573.5 154.2 L580.0 158.9 L586.5 163.5 L593.0 168.1 L599.5 172.8 L606.1 177.4 L612.6 182.1 L619.1 186.7 L625.6 191.4 L632.1 196.0 L638.6 200.6 L645.2 205.2 L652.0 209.5 L658.9 213.5 L666.1 217.1 L673.4 220.3 L680.9 223.1 L688.5 225.5 L696.2 227.5 L704.1 229.1 L712.0 230.3 L719.9 231.1 L727.9 231.4 L735.9 231.5 L743.9 231.5 L751.9 231.5 L759.9 231.5 L767.9 231.5 L775.9 231.5 L783.9 231.5 L791.9 231.5 L799.9 231.5 L807.9 231.5 L815.9 231.5 L823.9 231.5 L831.9 231.5 L839.9 231.5 L847.9 231.5 L855.9 231.5 L863.9 231.6 L871.9 232.1 L879.9 233.0 L887.7 234.4 L895.5 236.2 L903.2 238.5 L910.7 241.3 L918.0 244.6 L925.1 248.3 L931.9 252.4 L938.6 256.9 L944.9 261.7 L951.1 266.8 L957.2 272.0 L963.3 277.1 L969.4 282.3 L975.6 287.4 L981.7 292.6 L987.8 297.7 L993.9 302.9 L1000.1 308.0 L1006.2 313.1 L1012.3 318.3 L1018.4 323.4 L1024.6 328.6 L1030.7 333.7 L1036.8 338.9 L1042.9 344.0 L1049.2 349.0 L1055.7 353.6 L1062.5 357.9 L1069.5 361.7 L1076.8 365.1 L1084.2 368.1 L1091.8 370.6 L1099.5 372.6 L1107.4 374.2 L1115.3 375.3 L1123.3 375.9 L1131.3 376.1 L1139.3 376.2 L1147.3 376.2 L1155.3 376.2 L1163.3 376.2 L1171.3 376.2 L1179.3 376.3 L1187.3 376.3 L1195.3 376.3 L1203.3 376.3 L1211.3 376.3 L1219.3 376.4 L1227.3 376.4 L1235.3 376.4 L1243.3 376.4 L1251.3 376.5 L1259.3 376.5 L1267.3 376.5 L1275.3 376.5 L1283.3 376.5 L1291.3 376.6 L1299.3 376.6 L1307.3 376.6 L1315.3 376.6 L1323.3 376.6 L1331.3 376.7 L1339.3 376.7 L1347.3 376.7 L1355.3 376.9 L1363.2 377.4 L1371.2 378.1 L1379.1 379.1 L1387.0 380.4 L1394.9 382.1 L1402.6 384.0 L1410.3 386.1 L1418.0 388.5 L1425.5 391.2 L1433.0 394.1 L1440.4 397.1 L1447.7 400.3 L1454.9 403.9 L1462.0 407.6 L1468.9 411.5 L1475.7 415.8 L1482.4 420.2 L1488.9 424.8 L1495.3 429.6 L1501.6 434.5 L1507.7 439.7 L1513.6 445.1 L1519.3 450.8 L1524.9 456.5 L1530.3 462.4 L1535.5 468.5 L1540.4 474.7 L1545.1 481.2 L1549.7 487.8 L1554.1 494.5 L1558.2 501.3 L1562.2 508.2 L1566.0 515.3 L1569.5 522.5 L1572.7 529.8 L1575.7 537.3 L1578.4 544.8 L1580.9 552.4 L1583.1 560.1 L1585.2 567.8 L1587.0 575.6 L1588.6 583.4 L1590.0 591.3 L1591.1 599.2 L1591.9 607.2 L1592.5 615.1 L1592.9 623.1 L1593.0 631.1 L1592.8 639.1 L1592.3 647.1 L1591.7 655.1 L1590.8 663.0 L1589.5 670.9 L1588.0 678.8 L1586.3 686.6 L1584.5 694.4 L1582.2 702.1 L1579.6 709.6 L1576.7 717.1 L1573.7 724.5 L1570.4 731.8 L1567.0 739.0 L1563.3 746.1 L1559.3 753.1 L1555.1 759.8 L1550.6 766.5 L1545.9 773.0 L1541.1 779.3 L1536.0 785.5 L1530.6 791.5 L1525.1 797.2 L1519.3 802.8 L1513.4 808.2 L1507.4 813.4 L1501.1 818.4 L1494.7 823.1 L1488.0 827.6 L1481.3 831.9 L1474.4 835.9 L1467.3 839.7 L1460.1 843.2 L1452.8 846.4 L1445.4 849.4 L1437.9 852.1 L1430.3 854.6 L1422.6 856.9 L1414.8 858.9 L1407.0 860.2 L1399.0 860.8 L1391.0 861.0 L1383.0 861.1 L1375.0 861.4 L1367.0 861.5 L1359.0 861.5 L1351.0 861.5 L1343.0 861.5 L1335.0 861.5 L1327.0 861.7 L1319.0 861.9 L1311.0 862.0 L1303.0 862.0 L1295.0 862.0 L1287.0 862.0 L1279.0 862.0 L1271.0 862.0 L1263.0 862.0 L1255.0 862.0 L1247.0 862.0 L1239.0 862.0 L1231.0 862.0 L1223.0 862.0 L1215.0 862.0 L1207.0 862.0 L1199.0 862.0 L1191.0 862.0 L1183.0 862.1 L1175.0 862.3 L1167.0 862.5 L1159.0 862.7 L1151.0 862.7 L1143.0 862.6 L1135.0 862.5 L1127.0 862.4 L1119.0 862.3 L1111.0 862.2 L1103.0 862.1 L1095.0 862.0 L1092.0 862.0',
      },
      'diagonal-sul': {
        nome: 'Diagonal sul',
        inicio: 'agulha-central',
        fim: 'agulha-sul',
        tracado: 'M346.0 560.0 L354.0 560.4 L361.9 561.6 L369.6 563.7 L377.0 566.7 L384.1 570.4 L390.7 574.9 L397.0 579.8 L403.3 584.8 L409.5 589.8 L415.8 594.8 L422.1 599.7 L428.3 604.7 L434.6 609.7 L440.9 614.6 L447.1 619.6 L453.4 624.6 L459.7 629.6 L465.9 634.5 L472.2 639.5 L478.5 644.5 L484.7 649.5 L491.0 654.4 L497.3 659.4 L503.5 664.4 L509.8 669.3 L516.1 674.3 L522.3 679.3 L528.6 684.3 L534.9 689.2 L541.1 694.2 L547.4 699.2 L553.9 703.9 L560.6 708.3 L567.5 712.3 L574.6 715.9 L582.0 719.1 L589.5 721.8 L597.1 724.1 L604.9 726.0 L612.8 727.4 L620.7 728.3 L628.7 728.9 L636.7 729.0 L644.7 729.0 L652.7 729.0 L660.7 729.0 L668.7 729.0 L676.7 729.0 L684.7 729.0 L692.7 729.0 L700.7 729.0 L708.7 729.0 L716.7 729.0 L724.7 729.0 L732.7 729.0 L740.7 729.0 L748.7 729.0 L756.7 729.0 L764.7 729.0 L772.7 729.0 L780.7 729.0 L788.7 729.0 L796.7 729.0 L804.7 729.0 L812.7 729.0 L820.7 729.0 L828.7 729.0 L836.7 729.0 L844.7 729.0 L852.7 729.0 L860.7 729.1 L868.7 729.6 L876.6 730.6 L884.5 732.1 L892.2 734.1 L899.8 736.6 L907.2 739.6 L914.4 743.2 L921.3 747.2 L927.9 751.7 L934.3 756.6 L940.3 761.8 L946.1 767.4 L951.9 772.9 L957.6 778.4 L963.4 783.9 L969.2 789.5 L975.0 795.0 L980.8 800.5 L986.5 806.1 L992.3 811.6 L998.1 817.1 L1003.9 822.7 L1009.7 828.2 L1015.5 833.6 L1021.7 838.7 L1028.2 843.3 L1035.1 847.5 L1042.2 851.2 L1049.5 854.4 L1057.1 857.0 L1064.8 859.0 L1072.6 860.5 L1080.6 861.5 L1088.6 862.0 L1092.0 862.0',
      },
      ramal: {
        nome: 'Ramal sem saída',
        inicio: 'agulha-central',
        fim: 'para-choque',
        tracado: 'M346.0 560.0 L354.0 560.0 L362.0 560.0 L370.0 560.0 L378.0 560.0 L386.0 560.0 L394.0 560.1 L402.0 560.1 L410.0 560.1 L418.0 560.0 L426.0 560.0 L434.0 560.0 L442.0 560.0 L450.0 560.0 L458.0 560.0 L466.0 560.0 L474.0 560.0 L482.0 560.0 L490.0 560.0 L498.0 560.0 L506.0 560.0 L514.0 560.0 L522.0 560.0 L530.0 560.0 L538.0 560.0 L546.0 560.0 L554.0 560.0 L562.0 560.0 L570.0 560.0 L578.0 560.0 L586.0 560.0 L594.0 560.0 L602.0 560.0 L610.0 560.1 L618.0 560.3 L626.0 560.5 L634.0 560.5 L642.0 560.5 L650.0 560.4 L658.0 560.2 L666.0 560.0 L674.0 560.0 L682.0 560.0 L690.0 560.0 L698.0 560.0 L706.0 560.0 L714.0 560.0 L722.0 560.0 L730.0 560.0 L738.0 560.0 L746.0 560.0 L754.0 560.0 L762.0 560.1 L770.0 560.4 L778.0 560.5 L786.0 560.5 L794.0 560.5 L802.0 560.5 L810.0 560.5 L818.0 560.5 L826.0 560.7 L834.0 561.0 L841.9 561.7 L849.9 562.8 L857.7 564.4 L865.4 566.5 L873.0 569.1 L880.4 572.0 L887.9 574.8 L895.4 577.8 L902.8 580.7 L910.3 583.6 L917.7 586.4 L925.2 589.3 L932.7 592.1 L940.2 595.0 L947.6 597.8 L955.1 600.7 L962.6 603.6 L970.0 606.4 L977.5 609.3 L985.0 612.2 L992.4 615.1 L999.9 617.9 L1007.4 620.8 L1014.9 623.6 L1022.3 626.5 L1029.8 629.3 L1037.3 632.2 L1044.7 635.1 L1052.2 637.9 L1059.7 640.8 L1067.2 643.6 L1074.6 646.5 L1082.1 649.3 L1089.6 652.1 L1097.1 655.0 L1104.6 657.8 L1112.1 660.6 L1119.5 663.4 L1127.0 666.3 L1134.5 669.2 L1141.9 672.2 L1149.3 675.2 L1152.5 676.5',
      },
    },

    nos: {
      'agulha-norte': {
        tipo: 'agulha',
        nome: 'Agulha Norte',
        posicao: { x: 430, y: 72 },
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
        posicao: { x: 346, y: 560 },
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
        posicao: { x: 1092, y: 862 },
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
        /** Segundos parado antes de inverter (como um trem real; dá tempo às cancelas). */
        pausaAoInverter: 1.5,
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
      { id: 'reta-norte', nome: 'Reta Norte', tipo: 'trecho', segmento: 'principal', de: 0, ate: 0.189 },
      { id: 'curva-nordeste', nome: 'Curva Nordeste', tipo: 'trecho', segmento: 'principal', de: 0.189, ate: 0.299 },
      { id: 'curva-leste-interna', nome: 'Curva Leste Interna', tipo: 'trecho', segmento: 'principal', de: 0.299, ate: 0.39 },
      { id: 'serpentina-central', nome: 'Serpentina Central', tipo: 'trecho', segmento: 'principal', de: 0.39, ate: 0.474 },
      { id: 'reta-central', nome: 'Reta Central', tipo: 'trecho', segmento: 'principal', de: 0.474, ate: 0.621 },
      { id: 'curva-oeste-inferior', nome: 'Curva Oeste Inferior', tipo: 'trecho', segmento: 'principal', de: 0.621, ate: 0.792 },
      { id: 'reta-sul', nome: 'Reta Sul', tipo: 'trecho', segmento: 'principal', de: 0.792, ate: 1 },

      { id: 'reta-norte-oeste', nome: 'Reta Norte (trecho oeste)', tipo: 'trecho', segmento: 'oeste', de: 0, ate: 0.164 },
      { id: 'curva-oeste-superior', nome: 'Curva Oeste Superior', tipo: 'trecho', segmento: 'oeste', de: 0.164, ate: 0.87 },
      { id: 'acesso-agulha-central', nome: 'Acesso à Agulha Central', tipo: 'trecho', segmento: 'oeste', de: 0.87, ate: 1 },

      { id: 'diagonal-norte', nome: 'Diagonal Norte', tipo: 'trecho', segmento: 'diagonal-norte', de: 0, ate: 0.165 },
      { id: 'serpentina-norte', nome: 'Serpentina Norte', tipo: 'trecho', segmento: 'diagonal-norte', de: 0.165, ate: 0.393 },
      { id: 'ligacao-leste', nome: 'Reta de Ligação Leste', tipo: 'trecho', segmento: 'diagonal-norte', de: 0.393, ate: 0.531 },
      { id: 'curva-leste', nome: 'Curva Leste', tipo: 'trecho', segmento: 'diagonal-norte', de: 0.531, ate: 0.849 },
      { id: 'reta-sul-leste', nome: 'Reta Sul (trecho leste)', tipo: 'trecho', segmento: 'diagonal-norte', de: 0.849, ate: 1 },

      { id: 'diagonal-sul', nome: 'Diagonal Sul', tipo: 'trecho', segmento: 'diagonal-sul', de: 0, ate: 0.408 },
      { id: 'serpentina-sul', nome: 'Serpentina Sul', tipo: 'trecho', segmento: 'diagonal-sul', de: 0.408, ate: 1 },

      { id: 'linha-ramal', nome: 'Linha do Ramal', tipo: 'trecho', segmento: 'ramal', de: 0, ate: 0.609 },
      { id: 'ramal-sem-saida', nome: 'Ramal sem Saída', tipo: 'trecho', segmento: 'ramal', de: 0.609, ate: 1 },

      { id: 'area-agulha-norte', nome: 'Agulha Norte (bifurcação)', tipo: 'ponto', categoria: 'agulha', posicao: { x: 430, y: 72 }, raio: 28 },
      { id: 'area-agulha-central', nome: 'Agulha Central (bifurcação)', tipo: 'ponto', categoria: 'agulha', posicao: { x: 346, y: 560 }, raio: 28 },
      { id: 'area-agulha-sul', nome: 'Agulha Sul (bifurcação)', tipo: 'ponto', categoria: 'agulha', posicao: { x: 1092, y: 862 }, raio: 28 },
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
