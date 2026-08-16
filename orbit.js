// ---------------------------------------------------------------
// Motor del widget "foto de perfil con iconos orbitando". Lo comparten
// index.html y embed.html: espera encontrar en el documento un
// .orbit-wrap > .orbit con dentro un .hub, varios .node (enlaces) y un
// <svg class="orbit-lines"> con #trail, #branch0 y #branch1 — ver
// cualquiera de las dos páginas para la estructura exacta. Los estilos
// correspondientes viven en orbit.css.
//
// Órbitas: cada icono gira alrededor de la foto en su propia elipse
// (tamaño e inclinación distintos), muy despacio y cada uno a una
// velocidad diferente. El tamaño simula profundidad — más grande cuanto
// más "cerca del observador" — y decide también el orden de pintado
// frente a la foto y frente a los demás iconos. Las elipses se
// mantienen fuera de la foto salvo un ligero roce en el borde, y su
// forma sigue adaptándose a la relación de aspecto real del contenedor
// (más vertical si es estrecho, más horizontal si es ancho). Si dos
// iconos van a cruzarse, rebotan entre sí en vez de acelerar.
//
// Rayo: no existe visualmente en reposo. Solo al clicar se calcula
// sobre la posición actual del icono y se revela dibujándose al ritmo
// de una chispa, con un par de bifurcaciones como en un rayo real.
// ---------------------------------------------------------------
(function () {
  var SQUARE = [-90, -45, 0, 45, 90, 135, 180, -135]; // fase inicial, repartida como un octógono
  var OMEGA_MIN = 1.5, OMEGA_MAX = 4.5;                // grados/seg — muy lento (una vuelta entre 80s y 240s)
  var FLATTEN = 0.6;                                  // achatamiento de cada elipse (efecto "de lado")

  var orbitWrap = document.querySelector(".orbit-wrap");
  var orbit = document.querySelector(".orbit");
  if (!orbitWrap || !orbit) return; // esta página no tiene el widget

  var svg = document.querySelector(".orbit-lines");
  var hub = document.querySelector(".hub");
  var spark = document.getElementById("spark");
  var trail = document.getElementById("trail");
  var branchEls = [document.getElementById("branch0"), document.getElementById("branch1")];
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(min, val, max) { return Math.max(min, Math.min(max, val)); }
  function rand(min, max) { return min + Math.random() * (max - min); }

  // Un icono por elipse propia: velocidad, sentido, tamaño e
  // inclinación aleatorios (fijados una vez al cargar la página).
  var icons = Array.prototype.slice.call(document.querySelectorAll(".node")).map(function (el, i) {
    return {
      el: el,
      theta: SQUARE[i % SQUARE.length],    // ángulo actual (grados)
      dir: (i % 2 === 0) ? 1 : -1,         // sentidos alternos: los vecinos tienden a separarse, no a perseguirse
      omega: rand(OMEGA_MIN, OMEGA_MAX),   // velocidad angular propia
      sizeVar: rand(0.82, 1.18),           // tamaño de elipse propio
      tilt: rand(-16, 16),                 // inclinación propia (grados)
      radiusX: 0, radiusY: 0,
      dx: 0, dy: 0, vx: 0, vy: 0, size: 0, depth: 0
    };
  });

  var hubSizePx = 140, maxIconPx = 60, minIconPx = 44;
  var exFactorX = 1, exFactorY = 1;

  // Coloca un icono según su ángulo actual: posición (con inclinación
  // propia + estiramiento compartido según aspecto), tamaño según
  // profundidad, y orden de pintado según esa misma profundidad.
  function place(ic) {
    var rad = (ic.theta * Math.PI) / 180;
    var cosT = Math.cos(rad), sinT = Math.sin(rad);
    var lx = ic.radiusX * cosT;
    var ly = ic.radiusY * sinT;
    // Tangente (derivada de la posición respecto al ángulo): hace falta
    // para saber la velocidad real de cada icono y así, en una colisión,
    // decidir si YA se está alejando del otro o si hace falta rebotar.
    var dlx = -ic.radiusX * sinT;
    var dly = ic.radiusY * cosT;

    var tiltRad = (ic.tilt * Math.PI) / 180;
    var cosG = Math.cos(tiltRad), sinG = Math.sin(tiltRad);
    var rx = lx * cosG - ly * sinG;
    var ry = lx * sinG + ly * cosG;
    var drx = dlx * cosG - dly * sinG;
    var dry = dlx * sinG + dly * cosG;

    ic.dx = rx * exFactorX;
    ic.dy = ry * exFactorY;

    var thetaSpeed = (ic.dir * ic.omega * Math.PI) / 180; // grados/seg -> rad/seg, con signo
    ic.vx = drx * exFactorX * thetaSpeed;
    ic.vy = dry * exFactorY * thetaSpeed;

    ic.depth = (sinT + 1) / 2; // 0 = más lejos (más pequeño), 1 = más cerca (más grande)
    ic.size = minIconPx + (maxIconPx - minIconPx) * ic.depth;

    ic.el.style.left = "calc(50% + " + ic.dx.toFixed(2) + "px)";
    ic.el.style.top = "calc(50% + " + ic.dy.toFixed(2) + "px)";
    ic.el.style.width = ic.size.toFixed(2) + "px";
    ic.el.style.height = ic.size.toFixed(2) + "px";
    // Los más "cercanos" se pintan por encima de la foto (pueden rozar
    // su borde); los más "lejanos", por debajo (se asoman tras ella).
    ic.el.style.zIndex = String(2 + Math.round(ic.depth * 14));
  }

  function resize() {
    var w = orbitWrap.clientWidth, h = orbitWrap.clientHeight;
    if (!w || !h) return;

    var portraitness = h / (w + h);
    var t = clamp(-1, (portraitness - 0.5) * 6, 1); // >0 estrecho en vertical, <0 estrecho en horizontal
    var minDim = Math.min(w, h), maxDim = Math.max(w, h);

    var hubBasis = minDim + (maxDim - minDim) * Math.abs(t) * 0.4;
    hubSizePx = clamp(84, hubBasis * 0.26, 190);
    orbit.style.setProperty("--hub-size", hubSizePx + "px");

    var hubRadiusPx = hubSizePx / 2;
    maxIconPx = hubRadiusPx;        // diámetro máx. del icono = radio de la foto
    minIconPx = maxIconPx * 0.74;   // apenas varía, pero de lejos sigue viéndose bien

    // El achatamiento base (FLATTEN) ya deja el eje Y más corto que el X
    // para el efecto de profundidad; el estiramiento por aspecto tiene
    // que ser lo bastante fuerte como para invertir eso en contenedores
    // muy verticales (si no, el achatamiento "gana" y las órbitas siguen
    // pareciendo más anchas que altas por mucho que se estire). Con
    // FLATTEN=0.6, hace falta más de 1/0.6≈1.67x en el eje largo para
    // que el corto acabe siendo mayor — por eso el coeficiente es 1, no 0.45.
    exFactorX = 1 + Math.max(0, -t) * 1.0; // más ancho si el contenedor es apaisado
    exFactorY = 1 + Math.max(0, t) * 1.0;  // más alto si el contenedor es vertical

    var pad = 6;
    var budgetX = w / 2 - maxIconPx / 2 - pad;
    var budgetY = h / 2 - maxIconPx / 2 - pad;
    var baseOrbit = Math.min(budgetX, budgetY) * 0.8;
    // El eje corto de cada elipse (radiusY) es la distancia del CENTRO
    // del icono al centro del hub en su punto más cercano (el de mayor
    // tamaño). Para que el icono, como mucho, roce el borde de la foto
    // — y no se hunda en ella — hay que descontar el propio radio del
    // icono en ese punto, dejando solo un pequeño solape permitido.
    var iconMaxRadius = maxIconPx / 2;
    var allowedOverlap = iconMaxRadius * 0.3;
    var minOrbit = hubRadiusPx + iconMaxRadius - allowedOverlap;

    icons.forEach(function (ic) {
      // Límite real de radiusX según cada eje por separado (no una
      // aproximación compartida): tras aplicar el estiramiento, ni el
      // ancho (radiusX·exFactorX) ni el alto (radiusY·exFactorY) deben
      // salirse del espacio disponible.
      var rxCap = Math.min(budgetX / exFactorX, budgetY / (FLATTEN * exFactorY));
      var rx = clamp(minOrbit / FLATTEN, baseOrbit * ic.sizeVar, rxCap);
      ic.radiusX = rx;
      ic.radiusY = rx * FLATTEN;
      place(ic);
    });

    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
  }

  // -------- Si dos iconos se acercan demasiado, rebotan (invierten su
  // sentido de giro) en vez de acelerar, sin tocar la velocidad de
  // ninguno. Pero solo se invierte el sentido del que REALMENTE se esté
  // acercando al otro (según su velocidad real en pantalla): si uno de
  // los dos ya se estaba alejando, se deja como está. Invertir los dos
  // siempre (sin mirar la velocidad) es lo que hacía que a veces se
  // quedaran chocando en bucle: si iban en direcciones opuestas, uno de
  // los dos YA iba bien, y forzar su cambio lo devolvía justo hacia el
  // otro. --------
  var COOLDOWN_MS = 900, OVERLAP_FRAC = 1;
  var cooldowns = {};
  var lastCollisionCheck = 0;

  function checkCollisions(now) {
    for (var i = 0; i < icons.length; i++) {
      for (var j = i + 1; j < icons.length; j++) {
        var a = icons[i], b = icons[j], key = i + "-" + j;
        if (cooldowns[key] && now < cooldowns[key]) continue;
        var nx = b.dx - a.dx, ny = b.dy - a.dy;
        var dist = Math.hypot(nx, ny);
        if (dist < ((a.size + b.size) / 2) * OVERLAP_FRAC) {
          var ux = nx / (dist || 1), uy = ny / (dist || 1); // normal de a hacia b
          if (a.vx * ux + a.vy * uy > 0) a.dir *= -1; // A se mueve hacia B: rebota
          if (b.vx * ux + b.vy * uy < 0) b.dir *= -1; // B se mueve hacia A: rebota
          cooldowns[key] = now + COOLDOWN_MS;
        }
      }
    }
  }

  var lastFrame = null;
  var orbitPaused = false; // se detiene un instante durante el destello del clic

  function frame(now) {
    var dt = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.5);
    lastFrame = now;

    if (!orbitPaused) {
      icons.forEach(function (ic) {
        ic.theta += ic.dir * ic.omega * dt;
        place(ic);
      });

      if (now - lastCollisionCheck > 80) {
        checkCollisions(now);
        lastCollisionCheck = now;
      }
    }

    requestAnimationFrame(frame);
  }

  resize();
  if (!reduceMotion) requestAnimationFrame(frame);
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(orbitWrap);
  } else {
    window.addEventListener("resize", resize);
  }

  function lightningPoints(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var amp = len * 0.15;
    var kinks = [
      { t: 0.18 + rand(-0.03, 0.03), o: 1 },
      { t: 0.38 + rand(-0.03, 0.03), o: -0.75 },
      { t: 0.58 + rand(-0.03, 0.03), o: 0.6 },
      { t: 0.8 + rand(-0.03, 0.03), o: -0.4 }
    ];
    var pts = [{ x: x0, y: y0 }];
    kinks.forEach(function (k) {
      pts.push({
        x: x0 + dx * k.t + nx * amp * k.o * rand(0.75, 1.15),
        y: y0 + dy * k.t + ny * amp * k.o * rand(0.75, 1.15)
      });
    });
    pts.push({ x: x1, y: y1 });
    return pts;
  }

  // Una bifurcación corta que sale de uno de los quiebros del rayo
  // principal, como una rama secundaria real que no llega al destino.
  function lightningBranch(mainPts, kinkIndex, mainLen) {
    var origin = mainPts[kinkIndex], prev = mainPts[kinkIndex - 1];
    var dirX = origin.x - prev.x, dirY = origin.y - prev.y;
    var dl = Math.hypot(dirX, dirY) || 1;
    dirX /= dl; dirY /= dl;
    var side = Math.random() > 0.5 ? 1 : -1;
    var ang = (rand(50, 75) * side * Math.PI) / 180;
    var bx = dirX * Math.cos(ang) - dirY * Math.sin(ang);
    var by = dirX * Math.sin(ang) + dirY * Math.cos(ang);
    var branchLen = mainLen * rand(0.16, 0.26);
    var mid = { x: origin.x + bx * branchLen * 0.55, y: origin.y + by * branchLen * 0.55 };
    var tip = { x: origin.x + bx * branchLen, y: origin.y + by * branchLen };
    var nx = -by, ny = bx, jag = branchLen * 0.2 * (Math.random() > 0.5 ? 1 : -1);
    mid.x += nx * jag;
    mid.y += ny * jag;
    return [origin, mid, tip];
  }

  function pathFromPoints(pts) {
    return pts.map(function (p, i) {
      return (i === 0 ? "M " : "L ") + p.x.toFixed(2) + " " + p.y.toFixed(2);
    }).join(" ");
  }

  function pathLength(pts) {
    var total = 0;
    for (var i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return total;
  }

  function fractionAtKink(pts, idx) {
    var total = pathLength(pts), acc = 0;
    for (var i = 1; i <= idx; i++) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return total ? acc / total : 0;
  }

  // Punto sobre la polilínea a una fracción t (0-1) de su longitud
  // real, para que la chispa avance a velocidad constante.
  function pointAlongPolyline(pts, t) {
    var segLens = [], total = 0, i;
    for (i = 1; i < pts.length; i++) {
      segLens.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      total += segLens[segLens.length - 1];
    }
    var target = t * total, acc = 0;
    for (i = 0; i < segLens.length; i++) {
      if (acc + segLens[i] >= target || i === segLens.length - 1) {
        var segT = segLens[i] ? (target - acc) / segLens[i] : 0;
        segT = clamp(0, segT, 1);
        var a = pts[i], b = pts[i + 1];
        return { x: a.x + (b.x - a.x) * segT, y: a.y + (b.y - a.y) * segT };
      }
      acc += segLens[i];
    }
    return pts[pts.length - 1];
  }

  // -------- Clic: destello + chispa dibujando el rayo a su paso --------
  var DURATION = 230, HOLD = 130;
  var busy = false;

  function resetClickEffect() {
    spark.classList.remove("active");
    hub.classList.remove("flash");
    trail.classList.remove("active");
    branchEls.forEach(function (b) { b.classList.remove("active"); });
    icons.forEach(function (ic) { ic.el.classList.remove("flash"); });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") resetClickEffect();
  });

  function playClickEffect(ic) {
    busy = true;
    orbitPaused = true;
    return new Promise(function (resolve) {
      function finish() {
        busy = false;
        orbitPaused = false;
        resolve();
      }

      if (reduceMotion) {
        hub.classList.add("flash");
        ic.el.classList.add("flash");
        setTimeout(function () {
          resetClickEffect();
          finish();
        }, 150);
        return;
      }

      var w = orbitWrap.clientWidth, h = orbitWrap.clientHeight;
      var hubX = w / 2, hubY = h / 2;
      var iconX = hubX + ic.dx, iconY = hubY + ic.dy;

      // El rayo no sale del centro de la foto, sino de su borde, por el
      // punto más cercano al icono al que se dirige.
      var toIconX = iconX - hubX, toIconY = iconY - hubY;
      var toIconLen = Math.hypot(toIconX, toIconY) || 1;
      var hubRadiusPx = hubSizePx / 2;
      var startX = hubX + (toIconX / toIconLen) * hubRadiusPx;
      var startY = hubY + (toIconY / toIconLen) * hubRadiusPx;

      var pts = lightningPoints(startX, startY, iconX, iconY);
      var mainLen = pathLength(pts);

      hub.classList.add("flash");
      spark.style.transform = "translate(" + (startX - 5.5).toFixed(2) + "px, " + (startY - 5.5).toFixed(2) + "px)";
      spark.classList.add("active");

      var steps = 18, frames = [];
      for (var i = 0; i <= steps; i++) {
        var p = pointAlongPolyline(pts, i / steps);
        frames.push({ transform: "translate(" + (p.x - 5.5).toFixed(2) + "px, " + (p.y - 5.5).toFixed(2) + "px)" });
      }
      var travel = spark.animate(frames, { duration: DURATION, easing: "ease-in" });

      trail.setAttribute("d", pathFromPoints(pts));
      var len = trail.getTotalLength();
      trail.style.strokeDasharray = len;
      trail.style.strokeDashoffset = len;
      trail.classList.add("active");
      trail.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: DURATION, easing: "ease-in" });

      // Dos bifurcaciones que aparecen justo cuando la chispa pasa por
      // el quiebro del que salen.
      [1, 3].forEach(function (kinkIdx, idx) {
        var branchEl = branchEls[idx];
        var branchPts = lightningBranch(pts, kinkIdx, mainLen);
        var delay = fractionAtKink(pts, kinkIdx) * DURATION;
        setTimeout(function () {
          branchEl.setAttribute("d", pathFromPoints(branchPts));
          branchEl.classList.add("active");
        }, delay);
      });

      travel.onfinish = function () {
        spark.classList.remove("active");
        hub.classList.remove("flash");
        trail.classList.remove("active");
        branchEls.forEach(function (b) { b.classList.remove("active"); });
        ic.el.classList.add("flash");
        setTimeout(function () {
          resetClickEffect();
          finish();
        }, HOLD);
      };
    });
  }

  icons.forEach(function (ic) {
    ic.el.addEventListener("click", function (e) {
      // Se retrasa la navegación lo justo para que el destello se vea
      // ANTES de que se abra la pestaña nueva (o se navegue), en vez de
      // que la pestaña robe el foco al instante y el efecto solo se
      // aprecie al volver.
      e.preventDefault();
      var href = ic.el.href;
      var opensBlank = ic.el.target === "_blank";
      function go() {
        if (opensBlank) {
          window.open(href, "_blank", "noopener");
        } else {
          window.location.href = href;
        }
      }
      if (busy) { go(); return; }
      playClickEffect(ic).then(go);
    });
  });
})();
