// Sistema de Partículas Premium para TrucoMania Auth
class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.maxParticles = 60;
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseInfluence = 0.3;
    this.animId = null;
    this.resize();
    this.bindEvents();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    this.canvas.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      this.mouseX = t.clientX;
      this.mouseY = t.clientY;
    }, { passive: true });
  }

  createParticle() {
    const hue = Math.random() > 0.5
      ? 120 + Math.random() * 30  // verde
      : 45 + Math.random() * 20;  // dourado

    return {
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -(Math.random() * 0.3 + 0.1),
      size: Math.random() * 3 + 1.5,
      hue: hue,
      saturation: 60 + Math.random() * 40,
      lightness: 40 + Math.random() * 30,
      alpha: Math.random() * 0.4 + 0.1,
      life: Math.random() * 0.5 + 0.5,
      maxLife: Math.random() * 0.5 + 0.5,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.02,
    };
  }

  update() {
    if (this.particles.length < this.maxParticles) {
      this.particles.push(this.createParticle());
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      // Movimento
      p.x += p.vx;
      p.y += p.vy;
      
      // Influência do mouse
      const dx = this.mouseX - p.x;
      const dy = this.mouseY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200) {
        const force = (1 - dist / 200) * this.mouseInfluence;
        p.vx += dx / dist * force * 0.05;
        p.vy += dy / dist * force * 0.05;
      }
      
      // Amortecimento
      p.vx *= 0.99;
      p.vy *= 0.99;
      
      // Pulso de brilho
      p.pulse += p.pulseSpeed;
      p.alphaBase = Math.sin(p.pulse) * 0.15 + 0.25;
      
      // Life
      p.life -= 0.003;
      
      // Remover se morto ou fora da tela
      if (p.life <= 0 || p.y < -20 || p.x < -20 || p.x > this.canvas.width + 20) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    for (const p of this.particles) {
      const alpha = p.alpha * p.life * p.alphaBase;
      
      // Glow externo
      const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
      gradient.addColorStop(0, `hsla(${p.hue}, ${p.saturation}%, ${p.lightness}%, ${alpha * 0.4})`);
      gradient.addColorStop(0.5, `hsla(${p.hue}, ${p.saturation}%, ${p.lightness}%, ${alpha * 0.1})`);
      gradient.addColorStop(1, `hsla(${p.hue}, ${p.saturation}%, ${p.lightness}%, 0)`);
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Partícula central
      this.ctx.fillStyle = `hsla(${p.hue}, ${p.saturation}%, ${p.lightness + 20}%, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Brilho central
      this.ctx.fillStyle = `hsla(${p.hue}, 100%, 90%, ${alpha * 0.6})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  loop() {
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(() => this.loop());
  }

  start() {
    // Preencher com partículas iniciais
    for (let i = 0; i < this.maxParticles * 0.6; i++) {
      const p = this.createParticle();
      p.life = 0.5 + Math.random() * 0.5;
      this.particles.push(p);
    }
    this.loop();
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.stop();
    this.particles = [];
  }
}

// Haze atmosférico
class HazeEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layers = [];
    this.animId = null;
    this.resize();
    this.init();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  init() {
    for (let i = 0; i < 4; i++) {
      this.layers.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.08,
        radius: 200 + Math.random() * 300,
        alpha: 0.03 + Math.random() * 0.04,
        hue: Math.random() > 0.5 ? 120 : 45,
      });
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    for (const layer of this.layers) {
      layer.x += layer.vx;
      layer.y += layer.vy;
      
      // Wrap around
      if (layer.x < -layer.radius) layer.x = this.canvas.width + layer.radius;
      if (layer.x > this.canvas.width + layer.radius) layer.x = -layer.radius;
      if (layer.y < -layer.radius) layer.y = this.canvas.height + layer.radius;
      if (layer.y > this.canvas.height + layer.radius) layer.y = -layer.radius;
      
      const gradient = this.ctx.createRadialGradient(
        layer.x, layer.y, 0,
        layer.x, layer.y, layer.radius
      );
      gradient.addColorStop(0, `hsla(${layer.hue}, 50%, 30%, ${layer.alpha})`);
      gradient.addColorStop(0.5, `hsla(${layer.hue}, 40%, 20%, ${layer.alpha * 0.5})`);
      gradient.addColorStop(1, `hsla(${layer.hue}, 30%, 10%, 0)`);
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(layer.x, layer.y, layer.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  loop() {
    this.draw();
    this.animId = requestAnimationFrame(() => this.loop());
  }

  start() {
    this.loop();
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}