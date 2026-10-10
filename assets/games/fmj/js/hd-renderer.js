;(function (global) {
    'use strict';

    var DEFAULT_SCALE = 3;
    var renderer = null;
    var highDefinitionEnabled = initialHighDefinitionEnabled();

    /**
     * 根据预览 URL 初始化画质模式。
     *
     * Flutter 正式运行时会在页面就绪后调用 setEnabled 覆盖该值；查询参数仅用于
     * 浏览器内快速比较，不参与存档，也不会改变游戏逻辑状态。
     *
     * @return {boolean} 未明确指定 classic 时默认启用高清模式。
     */
    function initialHighDefinitionEnabled() {
        try {
            return new URLSearchParams(global.location.search).get('graphics') !== 'classic';
        } catch (_) {
            return true;
        }
    }

    /**
     * 将 RGBA 通道编码为稳定的无符号整数，只用于颜色比较和缓存键。
     *
     * @param {{r:number, g:number, b:number, a:number}|null|undefined} color 游戏颜色对象。
     * @return {number} 与 CPU 字节序无关的 RGBA 键。
     */
    function colorKey(color) {
        if (!color) return 0;
        var alpha = color.a == null ? 255 : color.a;
        return (
            ((color.r & 255) << 24) |
            ((color.g & 255) << 16) |
            ((color.b & 255) << 8) |
            (alpha & 255)
        ) >>> 0;
    }

    /**
     * 边缘感知的三倍渲染器。
     *
     * 接收原视野 160×96 或远视野 320×192 的逻辑画布，本类只处理最终显示帧。内部缓存
     * ImageData、颜色表和离屏画布，避免 25 FPS 刷新过程中持续分配大数组。
     *
     * @param {HTMLCanvasElement} canvas 页面显示画布。
     */
    function HdRenderer(canvas) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.sourceCanvas = document.createElement('canvas');
        this.sourceContext = this.sourceCanvas.getContext('2d');
        this.sourceImage = null;
        this.sourceKeys = null;
        this.outputImage = null;
        this.outputPixels = null;
        this.paletteCache = new Map();
        this.blendCache = new Map();
        this.sourceWidth = 0;
        this.sourceHeight = 0;
        this.scale = DEFAULT_SCALE;
        this.lastHighDefinitionEnabled = null;

        var endianProbe = new Uint8Array([1, 2, 3, 4]);
        this.littleEndian = new Uint32Array(endianProbe.buffer)[0] === 0x04030201;
    }

    /**
     * 确保帧缓冲区与游戏输出尺寸一致。
     *
     * @param {number} width 逻辑帧宽度。
     * @param {number} height 逻辑帧高度。
     */
    HdRenderer.prototype.ensureSize = function (width, height) {
        if (
            width === this.sourceWidth &&
            height === this.sourceHeight &&
            this.outputImage
        ) {
            return;
        }

        this.sourceWidth = width;
        this.sourceHeight = height;
        this.sourceCanvas.width = width;
        this.sourceCanvas.height = height;
        this.canvas.width = width * this.scale;
        this.canvas.height = height * this.scale;
        this.sourceImage = this.sourceContext.createImageData(width, height);
        this.sourceKeys = new Uint32Array(width * height);
        this.outputImage = this.context.createImageData(
            width * this.scale,
            height * this.scale
        );
        this.outputPixels = new Uint32Array(this.outputImage.data.buffer);
    };

    /**
     * 将 Kotlin/JS 颜色对象复制到可复用的源帧，并生成供 Scale3x 比较的颜色键。
     *
     * @param {ArrayLike<Object>} buffer 游戏输出颜色数组。
     */
    HdRenderer.prototype.copySourceFrame = function (buffer) {
        var bytes = this.sourceImage.data;
        var keys = this.sourceKeys;
        var changed = false;
        for (var index = 0; index < keys.length; index += 1) {
            var color = buffer[index];
            var byteIndex = index * 4;
            var alpha = color && color.a != null ? color.a : 255;
            bytes[byteIndex] = color ? color.r : 0;
            bytes[byteIndex + 1] = color ? color.g : 0;
            bytes[byteIndex + 2] = color ? color.b : 0;
            bytes[byteIndex + 3] = alpha;
            var key = colorKey(color);
            if (keys[index] !== key) changed = true;
            keys[index] = key;
        }
        return changed;
    };

    /**
     * 使用最近邻把源帧绘制到三倍画布，效果与改造前保持一致。
     */
    HdRenderer.prototype.drawClassic = function () {
        this.sourceContext.putImageData(this.sourceImage, 0, 0);
        this.context.imageSmoothingEnabled = false;
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.drawImage(
            this.sourceCanvas,
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );
    };

    /**
     * 读取颜色键中的 RGBA 通道。
     *
     * @param {number} key 颜色键。
     * @return {{r:number, g:number, b:number, a:number}} RGBA 通道。
     */
    HdRenderer.prototype.decodeColor = function (key) {
        return {
            r: (key >>> 24) & 255,
            g: (key >>> 16) & 255,
            b: (key >>> 8) & 255,
            a: key & 255
        };
    };

    /**
     * 将 RGBA 通道打包为当前设备可直接写入 ImageData 的原生整数。
     *
     * @return {number} 原生字节序像素。
     */
    HdRenderer.prototype.packNative = function (r, g, b, a) {
        if (this.littleEndian) {
            return ((r & 255) | ((g & 255) << 8) | ((b & 255) << 16) |
                ((a & 255) << 24)) >>> 0;
        }
        return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) |
            (a & 255)) >>> 0;
    };

    /**
     * 生成更适合高密度屏幕的墨色调色板。
     *
     * 原游戏是低色深黑白资源。这里仅轻微压暗墨色、提亮纸色并保留红色等特殊颜色，
     * 不改变透明关系和资源轮廓。
     *
     * @param {number} key 原始颜色键。
     * @return {{r:number, g:number, b:number, a:number, native:number}} 缓存后的显示颜色。
     */
    HdRenderer.prototype.palette = function (key) {
        var cached = this.paletteCache.get(key);
        if (cached) return cached;

        var color = this.decodeColor(key);
        var maximum = Math.max(color.r, color.g, color.b);
        var minimum = Math.min(color.r, color.g, color.b);
        var luminance = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
        var result;

        if (color.a === 0) {
            result = {r: 0, g: 0, b: 0, a: 0};
        } else if (maximum - minimum <= 18 && luminance < 80) {
            result = {r: 24, g: 27, b: 29, a: color.a};
        } else if (maximum - minimum <= 18 && luminance > 135) {
            result = {r: 216, g: 216, b: 207, a: color.a};
        } else {
            result = {
                r: Math.max(0, Math.min(255, Math.round((color.r - 128) * 1.08 + 128))),
                g: Math.max(0, Math.min(255, Math.round((color.g - 128) * 1.08 + 128))),
                b: Math.max(0, Math.min(255, Math.round((color.b - 128) * 1.08 + 128))),
                a: color.a
            };
        }
        result.native = this.packNative(result.r, result.g, result.b, result.a);
        this.paletteCache.set(key, result);
        return result;
    };

    /**
     * 对 Scale3x 生成的边缘中点增加轻量灰阶过渡，使文字和人物斜线不再呈现大方块。
     *
     * @param {number} foregroundKey 边缘颜色。
     * @param {number} backgroundKey 当前中心颜色。
     * @return {number} 可直接写入 ImageData 的原生像素。
     */
    HdRenderer.prototype.blendEdge = function (foregroundKey, backgroundKey) {
        if (foregroundKey === backgroundKey) return this.palette(foregroundKey).native;
        var cacheKey = foregroundKey + ':' + backgroundKey;
        var cached = this.blendCache.get(cacheKey);
        if (cached != null) return cached;

        var foreground = this.palette(foregroundKey);
        var background = this.palette(backgroundKey);
        var foregroundWeight = 0.82;
        var backgroundWeight = 1 - foregroundWeight;
        var nativeColor = this.packNative(
            Math.round(foreground.r * foregroundWeight + background.r * backgroundWeight),
            Math.round(foreground.g * foregroundWeight + background.g * backgroundWeight),
            Math.round(foreground.b * foregroundWeight + background.b * backgroundWeight),
            Math.round(foreground.a * foregroundWeight + background.a * backgroundWeight)
        );
        this.blendCache.set(cacheKey, nativeColor);
        return nativeColor;
    };

    /**
     * 使用 Scale3x 规则重建轮廓。
     *
     * 该算法只依据相邻像素关系补足斜线和圆角，不猜测游戏内容，因此不会产生实时
     * AI 超分常见的闪烁和文字错形。中心逻辑像素始终保留，避免细线消失。
     */
    HdRenderer.prototype.drawHighDefinition = function () {
        var width = this.sourceWidth;
        var height = this.sourceHeight;
        var outputWidth = width * this.scale;
        var source = this.sourceKeys;
        var target = this.outputPixels;

        for (var y = 0; y < height; y += 1) {
            var northY = y > 0 ? y - 1 : y;
            var southY = y + 1 < height ? y + 1 : y;
            var outputY = y * this.scale;

            for (var x = 0; x < width; x += 1) {
                var westX = x > 0 ? x - 1 : x;
                var eastX = x + 1 < width ? x + 1 : x;
                var a = source[northY * width + westX];
                var b = source[northY * width + x];
                var c = source[northY * width + eastX];
                var d = source[y * width + westX];
                var e = source[y * width + x];
                var f = source[y * width + eastX];
                var g = source[southY * width + westX];
                var h = source[southY * width + x];
                var i = source[southY * width + eastX];

                var e0 = d === b && d !== h && b !== f ? d : e;
                var e1 = (
                    (d === b && d !== h && b !== f && e !== c) ||
                    (b === f && b !== d && f !== h && e !== a)
                ) ? b : e;
                var e2 = b === f && b !== d && f !== h ? f : e;
                var e3 = (
                    (d === b && d !== h && b !== f && e !== g) ||
                    (d === h && d !== b && h !== f && e !== a)
                ) ? d : e;
                var e5 = (
                    (b === f && b !== d && f !== h && e !== i) ||
                    (h === f && d !== h && b !== f && e !== c)
                ) ? f : e;
                var e6 = d === h && d !== b && h !== f ? d : e;
                var e7 = (
                    (d === h && d !== b && h !== f && e !== i) ||
                    (h === f && d !== h && b !== f && e !== g)
                ) ? h : e;
                var e8 = h === f && d !== h && b !== f ? f : e;

                var outputX = x * this.scale;
                var row0 = outputY * outputWidth + outputX;
                var row1 = row0 + outputWidth;
                var row2 = row1 + outputWidth;

                target[row0] = this.palette(e0).native;
                target[row0 + 1] = this.blendEdge(e1, e);
                target[row0 + 2] = this.palette(e2).native;
                target[row1] = this.blendEdge(e3, e);
                target[row1 + 1] = this.palette(e).native;
                target[row1 + 2] = this.blendEdge(e5, e);
                target[row2] = this.palette(e6).native;
                target[row2 + 1] = this.blendEdge(e7, e);
                target[row2 + 2] = this.palette(e8).native;
            }
        }

        this.context.putImageData(this.outputImage, 0, 0);
    };

    /**
     * 绘制一帧，并在高清算法出现异常时自动回退到经典渲染。
     *
     * @param {ArrayLike<Object>} buffer 游戏输出颜色数组。
     * @param {number} width 逻辑帧宽度。
     * @param {number} height 逻辑帧高度。
     * @param {boolean} forceClassic 当前帧是否使用首次提交的原像素显示，保留用户的高清设置。
     */
    HdRenderer.prototype.draw = function (buffer, width, height, forceClassic) {
        this.ensureSize(width, height);
        var changed = this.copySourceFrame(buffer);
        var useHighDefinition = highDefinitionEnabled && !forceClassic;
        // 2× 逻辑帧有四倍像素，静态场景不重复做边缘放大；画质切换仍强制刷新。
        if (!changed && this.lastHighDefinitionEnabled === useHighDefinition) return;
        this.lastHighDefinitionEnabled = useHighDefinition;
        if (!useHighDefinition) {
            this.drawClassic();
            return;
        }

        try {
            this.drawHighDefinition();
        } catch (error) {
            highDefinitionEnabled = false;
            document.body.dataset.graphicsMode = 'classic';
            this.drawClassic();
            if (!global.__bbkHdRendererWarningShown) {
                global.__bbkHdRendererWarningShown = true;
                console.warn('伏魔记高清渲染失败，已回退经典画质。', error);
            }
        }
    };

    global.FmjHdRenderer = {
        /**
         * 切换高清与经典画质。切换只影响后续显示帧，不重启游戏、不触碰存档。
         *
         * @param {boolean} enabled 是否启用高清画质。
         */
        setEnabled: function (enabled) {
            highDefinitionEnabled = !!enabled;
            document.body.dataset.graphicsMode = highDefinitionEnabled ? 'hd' : 'classic';
        },

        /**
         * @return {boolean} 当前是否启用高清画质。
         */
        isEnabled: function () {
            return highDefinitionEnabled;
        },

        /**
         * 将一帧游戏内容绘制到显示画布。
         *
         * @param {HTMLCanvasElement} canvas 页面显示画布。
         * @param {ArrayLike<Object>} buffer 游戏输出颜色数组。
         * @param {number} width 逻辑帧宽度。
         * @param {number} height 逻辑帧高度。
         * @param {boolean} forceClassic 是否只为本帧保留原始点阵，不改持久化设置。
         */
        draw: function (canvas, buffer, width, height, forceClassic) {
            if (!renderer || renderer.canvas !== canvas) renderer = new HdRenderer(canvas);
            renderer.draw(buffer, width, height, forceClassic);
        }
    };

    document.documentElement.dataset.graphicsMode = highDefinitionEnabled
        ? 'hd'
        : 'classic';
})(this);
