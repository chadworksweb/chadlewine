export interface PortfolioItemMeta {
  line1?: string;
  line2?: string;
  line3?: string;
}

export interface PortfolioItem {
  id: string;
  title: string;
  slug: string;
  main: string;
  gallery: string[];
  meta?: PortfolioItemMeta;
  sold?: boolean;
  aspectRatio?: number;
  // Card focal point (0-100) + zoom for cropped thumbnails, same treatment as
  // song / release cover art. Null = centered.
  focalX?: number | null;
  focalY?: number | null;
  zoom?: number | null;
}

export interface PortfolioConfig {
  items: PortfolioItem[];
  fullscreen?: boolean;
  onItemClick: (item: PortfolioItem, index: number) => void;
}

type ListenerOpts = boolean | AddEventListenerOptions | undefined;

export class SlidingPortfolio {
  private container: HTMLElement;
  private viewport!: HTMLElement;
  private grid!: HTMLElement;
  private cursor: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private gyroIndicator: HTMLElement | null = null;
  private gyroDot: HTMLElement | null = null;

  private items: PortfolioItem[];
  private fullscreen: boolean;
  private onItemClick: PortfolioConfig["onItemClick"];

  private state = {
    posX: 0, posY: 0,
    velX: 0, velY: 0,
    targetVelX: 0, targetVelY: 0,
    cursorX: 0, cursorY: 0,
    displayCursorX: 0, displayCursorY: 0,
    gridWidth: 0, gridHeight: 0,
    viewportWidth: 0, viewportHeight: 0,
    hoveredItem: null as HTMLElement | null,
    selectedMobileItem: null as HTMLElement | null,
    isMobile: false,
    paused: false,
    maxSpeed: 5.44,
    acceleration: 0.08,
    cursorDamping: 0.7,
    columns: 5,
    gyroEnabled: false,
    initialDrift: false,
  };

  private animationId: number | null = null;
  private destroyed = false;
  private listeners: Array<() => void> = [];

  constructor(container: HTMLElement, config: PortfolioConfig) {
    this.container = container;
    this.items = [...config.items];
    this.fullscreen = config.fullscreen !== false;
    this.onItemClick = config.onItemClick;
    this.init();
  }

  setPaused(paused: boolean) {
    this.state.paused = paused;
    if (paused) {
      this.state.targetVelX = 0;
      this.state.targetVelY = 0;
      if (this.state.hoveredItem) {
        this.state.hoveredItem.classList.remove("is-lifted");
        this.state.hoveredItem = null;
      }
    }
    if (this.cursor) this.cursor.style.display = paused ? "none" : "";
    if (this.fullscreen && !this.state.isMobile) {
      this.container.style.cursor = paused ? "" : "none";
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    for (const remove of this.listeners) remove();
    this.listeners = [];
    if (this.cursor?.parentNode) this.cursor.parentNode.removeChild(this.cursor);
    if (this.tooltip?.parentNode) this.tooltip.parentNode.removeChild(this.tooltip);
    if (this.gyroIndicator?.parentNode) this.gyroIndicator.parentNode.removeChild(this.gyroIndicator);
    this.container.style.cursor = "";
  }

  private addListener(target: EventTarget, event: string, handler: EventListener, options?: ListenerOpts) {
    target.addEventListener(event, handler, options);
    this.listeners.push(() => target.removeEventListener(event, handler, options));
  }

  private init() {
    this.shuffleArray(this.items);
    this.state.isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const viewport = this.container.querySelector<HTMLElement>("[data-sarp-viewport]");
    const grid = this.container.querySelector<HTMLElement>("[data-sarp-grid]");
    if (!viewport || !grid) return;
    this.viewport = viewport;
    this.grid = grid;

    this.buildMasonry();
    this.setupEvents();

    if (!this.state.isMobile && this.fullscreen) {
      this.createCustomCursor();
      this.container.style.cursor = "none";
      this.viewport.style.cursor = "none";
      const angle = Math.random() * Math.PI * 2;
      const driftSpeed = 0.16;
      this.state.targetVelX = Math.cos(angle) * driftSpeed;
      this.state.targetVelY = Math.sin(angle) * driftSpeed;
      this.state.initialDrift = true;
    }

    if (this.state.isMobile && this.fullscreen) {
      this.createGyroIndicator();
      this.requestGyroPermission();
    }

    this.startAnimation();
  }

  private createCustomCursor() {
    const cursor = document.createElement("div");
    cursor.className = "sarp-custom-cursor";
    cursor.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8" opacity="0.3"/><circle cx="12" cy="12" r="3"/></svg>`;
    this.container.appendChild(cursor);
    this.cursor = cursor;

    // Site-standard cursor tooltip (.cursor-tooltip), shown with the hovered
    // piece's title.
    const tip = document.createElement("div");
    tip.className = "cursor-tooltip sarp-piece-tooltip";
    tip.style.position = "fixed";
    tip.style.display = "none";
    this.container.appendChild(tip);
    this.tooltip = tip;
  }

  private createGyroIndicator() {
    const indicator = document.createElement("button");
    indicator.className = "sarp-gyro-indicator";
    indicator.type = "button";
    indicator.setAttribute("aria-label", "Toggle tilt control");
    indicator.innerHTML = `
      <svg class="sarp-gyro-icon-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <svg class="sarp-gyro-icon-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><line x1="4" y1="4" x2="20" y2="20" stroke-width="2.5"/></svg>
      <div class="sarp-gyro-dot"></div>`;
    this.container.appendChild(indicator);
    this.gyroIndicator = indicator;
    this.gyroDot = indicator.querySelector<HTMLElement>(".sarp-gyro-dot");
    this.addListener(indicator, "click", (e) => {
      (e as Event).stopPropagation();
      this.toggleGyro();
    });
  }

  private toggleGyro() {
    this.state.gyroEnabled = !this.state.gyroEnabled;
    const indicator = this.gyroIndicator;
    if (!indicator) return;
    const iconOn = indicator.querySelector<HTMLElement>(".sarp-gyro-icon-on");
    const iconOff = indicator.querySelector<HTMLElement>(".sarp-gyro-icon-off");
    if (this.state.gyroEnabled) {
      indicator.classList.add("is-active");
      indicator.classList.remove("is-disabled");
      if (iconOn) iconOn.style.display = "";
      if (iconOff) iconOff.style.display = "none";
    } else {
      indicator.classList.remove("is-active");
      indicator.classList.add("is-disabled");
      if (iconOn) iconOn.style.display = "none";
      if (iconOff) iconOff.style.display = "";
      this.state.targetVelX = 0;
      this.state.targetVelY = 0;
      if (this.gyroDot) this.gyroDot.style.transform = "translate(0px, 0px)";
    }
  }

  private requestGyroPermission() {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (typeof DOE !== "undefined" && typeof DOE.requestPermission === "function") {
      const permBtn = document.createElement("button");
      permBtn.className = "sarp-gyro-permission-btn";
      permBtn.type = "button";
      permBtn.textContent = "Enable Tilt Control";
      this.viewport.appendChild(permBtn);
      this.addListener(permBtn, "click", async () => {
        try {
          const response = await DOE.requestPermission!();
          if (response === "granted") {
            this.setupGyroControl();
            permBtn.remove();
          }
        } catch {
          permBtn.textContent = "Permission denied";
          setTimeout(() => permBtn.remove(), 2000);
        }
      });
    } else if ("DeviceOrientationEvent" in window) {
      this.setupGyroControl();
    }
  }

  private setupGyroControl() {
    this.state.gyroEnabled = true;
    this.gyroIndicator?.classList.add("is-active");
    this.addListener(window, "deviceorientation", (ev) => {
      if (this.state.paused || !this.state.gyroEnabled) return;
      const e = ev as DeviceOrientationEvent;
      let beta = e.beta || 0;
      let gamma = e.gamma || 0;
      beta = Math.max(-12, Math.min(12, beta - 45));
      gamma = Math.max(-12, Math.min(12, gamma));
      const deadZone = 0.15;
      let nX = gamma / 12;
      let nY = beta / 12;
      nX = Math.abs(nX) < deadZone ? 0 : Math.sign(nX) * (Math.abs(nX) - deadZone) / (1 - deadZone);
      nY = Math.abs(nY) < deadZone ? 0 : Math.sign(nY) * (Math.abs(nY) - deadZone) / (1 - deadZone);
      const eX = Math.sign(nX) * Math.pow(Math.abs(nX), 0.8);
      const eY = Math.sign(nY) * Math.pow(Math.abs(nY), 0.8);
      this.state.targetVelX = -eX * this.state.maxSpeed * 0.55;
      this.state.targetVelY = eY * this.state.maxSpeed * 0.75;
      if (this.gyroDot) this.gyroDot.style.transform = `translate(${nX * 15}px, ${nY * 15}px)`;
    }, { passive: true });
  }

  private buildMasonry() {
    if (this.destroyed) return;
    this.grid.innerHTML = "";
    this.grid.classList.add("is-loading");
    this.state.viewportWidth = this.viewport.clientWidth;
    this.state.viewportHeight = this.viewport.clientHeight;

    if (this.state.viewportWidth < 600) this.state.columns = 6;
    else if (this.state.viewportWidth < 900) this.state.columns = 6;
    else if (this.state.viewportWidth < 1400) this.state.columns = 8;
    else this.state.columns = 10;

    const gap = 0;
    const sizeMultiplier = this.state.isMobile ? 2.01875 : 1.08375;
    const columnWidth = Math.floor((this.state.viewportWidth * sizeMultiplier) / 5);
    const columnHeights = new Array(this.state.columns).fill(0);

    const columns: HTMLElement[] = [];
    for (let i = 0; i < this.state.columns; i++) {
      const col = document.createElement("div");
      col.className = "sarp-masonry-column";
      col.style.width = columnWidth + "px";
      columns.push(col);
      this.grid.appendChild(col);
    }

    const expandedItems: Array<{ item: PortfolioItem; originalIndex: number; copy: number }> = [];
    const repeatCount = this.fullscreen ? 3 : 1;
    const itemCount = this.items.length;
    for (let r = 0; r < repeatCount; r++) {
      this.items.forEach((item, originalIndex) => {
        expandedItems.push({ item, originalIndex, copy: r });
      });
    }
    this.shuffleArray(expandedItems);

    const recentInColumn = new Array(this.state.columns).fill(null).map<number[]>(() => []);
    const minVerticalGap = 3;
    const wouldCreateDuplicate = (originalIndex: number, colIndex: number) => {
      for (let c = Math.max(0, colIndex - 1); c <= Math.min(this.state.columns - 1, colIndex + 1); c++) {
        const recent = recentInColumn[c];
        for (let i = 0; i < Math.min(minVerticalGap, recent.length); i++) {
          if (recent[recent.length - 1 - i] === originalIndex) return true;
        }
      }
      return false;
    };

    const itemQueue = [...expandedItems];
    let placedCount = 0;
    while (itemQueue.length > 0 && placedCount < expandedItems.length) {
      const shortestCol = columnHeights.indexOf(Math.min(...columnHeights));
      let bestIndex = 0;
      for (let i = 0; i < Math.min(itemQueue.length, itemCount); i++) {
        if (!wouldCreateDuplicate(itemQueue[i].originalIndex, shortestCol)) {
          bestIndex = i;
          break;
        }
      }
      const { item, originalIndex } = itemQueue.splice(bestIndex, 1)[0];
      recentInColumn[shortestCol].push(originalIndex);
      if (recentInColumn[shortestCol].length > minVerticalGap + 1) recentInColumn[shortestCol].shift();

      const itemDiv = document.createElement("div");
      itemDiv.className = "sarp-portfolio-item";
      itemDiv.dataset.index = String(originalIndex);

      if (item.sold) {
        const badgeWrap = document.createElement("div");
        badgeWrap.className = "sarp-item-badges";
        const badge = document.createElement("span");
        badge.className = "sarp-badge sarp-badge-sold";
        badge.textContent = "SOLD";
        badgeWrap.appendChild(badge);
        itemDiv.appendChild(badgeWrap);
      }

      const img = document.createElement("img");
      img.src = item.main;
      img.alt = item.title;
      img.loading = placedCount < 20 ? "eager" : "lazy";
      // Focal-point crop (matches song/release cover art on cropped thumbnails).
      if (item.focalX != null || item.focalY != null) {
        img.style.objectPosition = `${item.focalX ?? 50}% ${item.focalY ?? 50}%`;
      }
      if (item.zoom && item.zoom > 1) {
        img.style.transform = `scale(${item.zoom})`;
        img.style.transformOrigin = `${item.focalX ?? 50}% ${item.focalY ?? 50}%`;
      }

      const aspectRatio = item.aspectRatio || 1.5;
      itemDiv.style.paddingBottom = (100 / aspectRatio) + "%";

      img.onload = () => {
        const realRatio = img.naturalWidth / img.naturalHeight;
        itemDiv.style.paddingBottom = (100 / realRatio) + "%";
        item.aspectRatio = realRatio;
      };

      itemDiv.appendChild(img);
      columns[shortestCol].appendChild(itemDiv);
      placedCount++;
      columnHeights[shortestCol] += columnWidth / aspectRatio + gap;
    }

    this.state.gridWidth = this.state.columns * columnWidth + (this.state.columns - 1) * gap;
    this.state.gridHeight = Math.max(...columnHeights);
    this.state.posX = 0;
    this.state.posY = 0;
    this.state.velX = 0;
    this.state.velY = 0;
    this.state.targetVelX = 0;
    this.state.targetVelY = 0;
    this.grid.style.width = this.state.gridWidth + "px";
    this.grid.classList.remove("is-loading");
    this.updateGridPosition();
  }

  private setupEvents() {
    if (!this.state.isMobile) {
      this.addListener(this.container, "mousemove", (e) => this.handleMouseMove(e as MouseEvent));
      this.addListener(this.grid, "mouseenter", (e) => this.handleItemHover(e as MouseEvent), true);
      this.addListener(this.grid, "mouseleave", (e) => this.handleItemLeave(e as MouseEvent), true);
    }

    if (this.state.isMobile) {
      let touchStartX = 0, touchStartY = 0, startPosX = 0, startPosY = 0;
      this.addListener(this.viewport, "touchstart", (ev) => {
        const e = ev as TouchEvent;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        startPosX = this.state.posX;
        startPosY = this.state.posY;
      }, { passive: true });
      this.addListener(this.viewport, "touchmove", (ev) => {
        const e = ev as TouchEvent;
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        this.state.posX = startPosX + dx;
        this.state.posY = startPosY + dy;
        this.constrainPosition();
        this.updateGridPosition();
      }, { passive: true });
      this.addListener(this.grid, "click", (e) => this.handleTouchSelect(e as MouseEvent));
    }

    this.addListener(this.grid, "click", (e) => this.handleItemClick(e as MouseEvent));
    this.addListener(window, "resize", this.debounce(() => this.buildMasonry(), 250));
  }

  private handleMouseMove(e: MouseEvent) {
    if (this.state.initialDrift) this.state.initialDrift = false;
    this.state.cursorX = e.clientX;
    this.state.cursorY = e.clientY;

    if (!this.fullscreen) {
      const rect = this.container.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      if (relX < 0 || relX > rect.width || relY < 0 || relY > rect.height) {
        this.state.targetVelX = 0;
        this.state.targetVelY = 0;
        return;
      }
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const nX = (relX - centerX) / centerX;
      const nY = (relY - centerY) / centerY;
      const dz = 0.3;
      let adjX = 0, adjY = 0;
      if (Math.abs(nX) > dz) adjX = (Math.abs(nX) - dz) / (1 - dz) * Math.sign(nX);
      if (Math.abs(nY) > dz) adjY = (Math.abs(nY) - dz) / (1 - dz) * Math.sign(nY);
      this.state.targetVelX = -Math.sign(adjX) * Math.pow(Math.abs(adjX), 1.5) * this.state.maxSpeed;
      this.state.targetVelY = -Math.sign(adjY) * Math.pow(Math.abs(adjY), 1.5) * this.state.maxSpeed;
      return;
    }

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const bezel = 50;

    if (e.clientX < bezel || e.clientX > winW - bezel || e.clientY < bezel || e.clientY > winH - bezel) {
      this.state.targetVelX = 0;
      this.state.targetVelY = 0;
      return;
    }

    const activeW = winW - bezel * 2;
    const activeH = winH - bezel * 2;
    const centerX = winW / 2;
    const centerY = winH / 2;
    const nX = (e.clientX - centerX) / (activeW / 2);
    const nY = (e.clientY - centerY) / (activeH / 2);
    const dz = 0.22;
    let adjX = 0, adjY = 0;
    if (Math.abs(nX) > dz) adjX = (Math.abs(nX) - dz) / (1 - dz) * Math.sign(nX);
    if (Math.abs(nY) > dz) adjY = (Math.abs(nY) - dz) / (1 - dz) * Math.sign(nY);
    adjX = Math.max(-1, Math.min(1, adjX));
    adjY = Math.max(-1, Math.min(1, adjY));
    const eX = Math.sign(adjX) * Math.pow(Math.abs(adjX), 1.5);
    const eY = Math.sign(adjY) * Math.pow(Math.abs(adjY), 1.5);
    this.state.targetVelX = -eX * this.state.maxSpeed;
    this.state.targetVelY = -eY * this.state.maxSpeed;
  }

  private handleItemHover(e: MouseEvent) {
    const item = (e.target as HTMLElement).closest<HTMLElement>(".sarp-portfolio-item");
    if (!item || this.state.paused) return;
    if (this.state.hoveredItem && this.state.hoveredItem !== item) {
      this.state.hoveredItem.classList.remove("is-lifted");
    }
    this.state.hoveredItem = item;
    item.classList.add("is-lifted");

    const idx = parseInt(item.dataset.index || "", 10);
    const title = !isNaN(idx) ? this.items[idx]?.title : "";
    if (this.tooltip && title) {
      this.tooltip.textContent = title;
      this.tooltip.style.display = "";
    }
  }

  private handleItemLeave(e: MouseEvent) {
    const item = (e.target as HTMLElement).closest<HTMLElement>(".sarp-portfolio-item");
    if (!item) return;
    if (item.contains(e.relatedTarget as Node)) return;
    item.classList.remove("is-lifted");
    if (this.state.hoveredItem === item) this.state.hoveredItem = null;
    if (this.tooltip) this.tooltip.style.display = "none";
  }

  private handleTouchSelect(e: MouseEvent) {
    const item = (e.target as HTMLElement).closest<HTMLElement>(".sarp-portfolio-item");
    if (!item) return;
    if (this.state.selectedMobileItem !== item) {
      e.preventDefault();
      if (this.state.selectedMobileItem) this.state.selectedMobileItem.classList.remove("is-focused");
      this.state.selectedMobileItem = item;
      item.classList.add("is-focused");
    }
  }

  private handleItemClick(e: MouseEvent) {
    const item = (e.target as HTMLElement).closest<HTMLElement>(".sarp-portfolio-item");
    if (!item) return;
    if (this.state.isMobile && this.state.selectedMobileItem !== item) return;
    const index = parseInt(item.dataset.index || "", 10);
    if (isNaN(index)) return;
    const itemData = this.items[index];
    if (!itemData) return;
    if (this.state.hoveredItem) {
      this.state.hoveredItem.classList.remove("is-lifted");
      this.state.hoveredItem = null;
    }
    if (this.state.selectedMobileItem) {
      this.state.selectedMobileItem.classList.remove("is-focused");
      this.state.selectedMobileItem = null;
    }
    if (this.tooltip) this.tooltip.style.display = "none";

    // Commit mechanic (like the discography cube): freeze the drift and pulse-
    // glow the chosen piece while the detail page loads.
    this.state.paused = true;
    this.state.targetVelX = 0;
    this.state.targetVelY = 0;
    this.state.velX = 0;
    this.state.velY = 0;
    if (this.cursor) this.cursor.style.display = "none";
    item.classList.remove("is-lifted");
    item.classList.add("is-loading");

    this.onItemClick(itemData, index);
  }

  private constrainPosition() {
    const visibleW = this.viewport.clientWidth;
    const visibleH = this.viewport.clientHeight;
    const minX = Math.min(0, -(this.state.gridWidth - visibleW));
    const minY = Math.min(0, -(this.state.gridHeight - visibleH));
    this.state.posX = Math.max(minX, Math.min(0, this.state.posX));
    this.state.posY = Math.max(minY, Math.min(0, this.state.posY));
  }

  private updateGridPosition() {
    this.grid.style.transform = `translate3d(${this.state.posX}px, ${this.state.posY}px, 0)`;
  }

  private startAnimation() {
    const animate = () => {
      if (this.destroyed) return;
      if (this.fullscreen && this.cursor) {
        this.state.displayCursorX += (this.state.cursorX - this.state.displayCursorX) * this.state.cursorDamping;
        this.state.displayCursorY += (this.state.cursorY - this.state.displayCursorY) * this.state.cursorDamping;
        this.cursor.style.transform = `translate(${this.state.displayCursorX}px, ${this.state.displayCursorY}px)`;
      }
      if (this.tooltip && this.tooltip.style.display !== "none") {
        this.tooltip.style.left = (this.state.cursorX + 18) + "px";
        this.tooltip.style.top = (this.state.cursorY + 18) + "px";
      }
      if (!this.state.paused) {
        this.state.velX += (this.state.targetVelX - this.state.velX) * this.state.acceleration;
        this.state.velY += (this.state.targetVelY - this.state.velY) * this.state.acceleration;
        this.state.posX += this.state.velX;
        this.state.posY += this.state.velY;
        this.constrainPosition();
        this.updateGridPosition();
      }
      this.animationId = requestAnimationFrame(animate);
    };
    animate();
  }

  private debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debounced = ((...args: unknown[]) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    }) as T;
    return debounced;
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
