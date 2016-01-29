var _Drag = {
    install: function(el, data, onstart, oncont, onend) {

        _Drag.move = function(e) {
            e.preventDefault();
            e.stopPropagation();
            oncont && oncont(data, e);
        };
    
        _Drag.done = function(e) {
            onend && onend(data, e);
            e.preventDefault();
            e.stopPropagation();
            if (el.setCapture) {
                el.removeEventListener('mousemove', _Drag.move);
                el.removeEventListener('mouseup', _Drag.done);
                el.removeEventListener('losecapture', _Drag.done);
            } else {
                document.removeEventListener('mousemove', _Drag.move);
                document.removeEventListener('mouseup', _Drag.done);
                // todo: restore old cursor
            }
            _Drag.move = null;
            _Drag.done = null;
        };
    
        if (el.setCapture) {
            el.setCapture(true);
            el.addEventListener('mousemove', _Drag.move);
            el.addEventListener('mouseup', _Drag.done);
            el.addEventListener('losecapture', _Drag.done);
        } else {
            var cursor = window.getComputedStyle(el).cursor;
            if (cursor != 'auto') {
                // todo: lock in this cursor style
            }
            document.addEventListener('mousemove', _Drag.move);
            document.addEventListener('mouseup', _Drag.done);
        }
    }
};

function makeDraggable(el, data, onstart, oncont, onend, selfOnly) {
    el.addEventListener('mousedown', function(e) {
        if (e.button != 0 || (selfOnly && e.target != el))
            return;
        e.stopPropagation();
        e.preventDefault();
        onstart && onstart(data, e);
        _Drag.install(el, data, onstart, oncont, onend);
    });
}

/*****************************************************************************/

var _CardAnims = {
    active:   [],
    lastTime: null,
    request:  null,
    enabled:  true,
};

function cardAnimFrame(time) {
    var dt = 0.03;
    if (_CardAnims.lastTime)
        dt = (time - _CardAnims.lastTime) / 1000;
    _CardAnims.lastTime = time;

    var anims = _CardAnims.active;
    _CardAnims.active = [];
    for (var i = anims.length-1; i >= 0; i--) {
        var param = anims[i];
        param.time += dt;
        
        var newVal = param.offset + param.speed * param.time;
        if ((param.speed < 0 && newVal <= param.target) ||
            (param.speed > 0 && newVal >= param.target)) {
            param.finish();
        } else {
            param.setter(newVal);
            _CardAnims.active.push(param);
        }
    }

    if (_CardAnims.active.length > 0) {
        _CardAnims.request = window.requestAnimationFrame(cardAnimFrame);
    } else {
        _CardAnims.request = null;
        _CardAnims.lastTime = null;
    }   
}

function CardAnimatable(getter, setter, minSpeed) {
    this.getter   = getter;
    this.setter   = setter;
    this.minSpeed = minSpeed || 0;
    this.callback = null;

    this.time     = null;
    this.speed    = null;
    this.offset   = null;
    this.target   = null;
}

CardAnimatable.prototype.finish = function() {
    this.setter(this.target);
    this.callback && this.callback();
};

CardAnimatable.prototype.setTarget = function(val, duration) {
    if (duration == null)
        duration = 0.25;

    var idx = _CardAnims.active.indexOf(this);
    this.target = val;
    this.offset = this.getter();

    if (!_CardAnims.enabled || this.offset == this.target || duration <= 0) {
        if (idx >= 0) 
            _CardAnims.active.splice(idx, 1);

        // set the value later to avoid unnecessary reflow
        var obj = this;
        setTimeout(function() { obj.finish(); }, 0);
        return;
    }

    if (_CardAnims.active.length == 0)
        _CardAnims.request = window.requestAnimationFrame(cardAnimFrame);

    this.time = 0;
    this.speed = (this.target - this.offset) / (duration || 0.5);
    if (Math.abs(this.speed) < this.minSpeed)
        this.speed = (this.speed < 0) ? -this.minSpeed : this.minSpeed;

    if (idx == -1)
        _CardAnims.active.push(this);
};

CardAnimatable.prototype.setSpeed = function(speed, target) {
    var idx = _CardAnims.active.indexOf(this);
    if (idx >= 0 && speed == this.speed)
        return;

    if (target == null)
        target = (speed < 0) ? 0 : Infinity;

    this.time   = 0;
    this.speed  = speed;
    this.target = target;
    this.offset = this.getter();

    if (this.offset == this.target)
        return;

    if (_CardAnims.active.length == 0)
        _CardAnims.request = window.requestAnimationFrame(cardAnimFrame);

    if (idx < 0)
        _CardAnims.active.push(this);
};

CardAnimatable.prototype.stop = function() {
    var idx = _CardAnims.active.indexOf(this);
    if (idx >= 0) {
        this.callback && this.callback();
        _CardAnims.active.splice(idx, 1);
    }
};

/*****************************************************************************/

function CardDeck(wrapper) {
    this.wrapper = wrapper || document.createElement('div');
    this.wrapper.classList.add('card-deck');

    this.insertAtLeft    = true; // New cards are inserted on the left side
    this.cardLimit       = 16;   // Cards are closed to stay under this limit
    this.defaultWidth    = 400;  // Default card width in pixels
    this.minWidth        = 30;   // Minimum card width in pixels
    this.autoscrollSpeed = 300;  // Used when dragging outside the view

    // To disable animations, set _CardAnims.enabled to false.
    this.addDuration    = 0.25; // animation duration for adding a card
    this.removeDuration = 0.25; // animation duration for removing a card
    this.springDuration = 0.25; // animation length for removing empty space

    // Create an element to explicitly set the scrollable width
    this.reserve = document.createElement('div');
    this.reserve.className = 'card-deck-reserve';
    this.wrapper.appendChild(this.reserve);

    var obj = this;
    this.widthAnim = new CardAnimatable(
        function()  { return obj.reserve.scrollWidth; },
        function(v) { obj.reserve.style.width = v + 'px'; }
    );
    this.scrollAnim = new CardAnimatable(
        function()  { return obj.wrapper.scrollLeft; },
        function(v) {
            if (obj.wrapper.scrollLeft != v) {
                obj.wrapper.scrollLeft = v; 
                setTimeout(function() {
                    if (obj.titleDragCard)
                        obj.titleDragCont(obj.titleDragCard);
                }, 0);
            }
        }
    );
    
    this.cards = [];
}

CardDeck.prototype.updateOffsets = function(duration, allowShrink) {
    if (duration == null)
        duration = 0.5;
    if (allowShrink == null)
        allowShrink = true;

    var x = 0;
    for (var i = 0; i < this.cards.length; i++) {
        if (this.cards[i].dragging != true)
            this.cards[i].xAnim.setTarget(x, duration);
        x += this.cards[i].wAnim.target;
    }
    if (allowShrink || x > this.reserve.clientWidth) 
        this.widthAnim.setTarget(x, duration);
};

CardDeck.prototype.scrollCardIntoView = function(card, duration) {
    duration = duration || this.springDuration;
    var v0 = this.wrapper.scrollLeft;
    var x0 = card.xAnim.target;
    if (x0 < v0) {
        this.scrollAnim.setTarget(x0, duration);
        return;
    }
    var v1 = this.wrapper.clientWidth + v0;
    var x1 = card.wAnim.target + x0;
    if (x1 > v1) 
        this.scrollAnim.setTarget(Math.min(x0, x1 - (v1 - v0)), duration);
};

CardDeck.prototype.setTopCard = function(card) {
    if (this.topCard != null)
        this.topCard.root.style.zIndex = '1';
    this.topCard = card;
    card.root.style.zIndex = '999';
};

CardDeck.prototype.addButton = function(card, html, func) {
    var el = document.createElement('span');
    el.className = 'card-button';
    el.innerHTML = html;
    el.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        func(e.target);
    });
    card.buttons.push(el);
    card.titlebar.appendChild(el);
};

CardDeck.prototype.add = function(args) {
    if (args == null)
        args = {};

    if (!(args.content instanceof HTMLElement)) {
        var cstr = (args.content || '').toString();
        args.content = document.createElement('div');
        args.content.textContent = cstr;
    }

    if (args.width == null)
        args.width = this.defaultWidth;

    var card = {
        deck:        this,
        content:     args.content,
        root:        document.createElement('div'),
        box:         document.createElement('div'),
        titlebar:    document.createElement('div'),
        titletext:   document.createElement('span'),
        sizer:       document.createElement('div'),
        onclose:     args.onclose,
        onresize:    args.onresize,
        buttons:     [],
    };

    card.root.className      = 'card-root';
    card.sizer.className     = 'card-sizer';
    card.box.className       = 'card-box';
    card.titlebar.className  = 'card-titlebar';
    card.content.classList.add('card-content');
    card.titletext.className = 'card-titletext';

    card.titletext.textContent = args.title || '';
    card.titlebar.appendChild(card.titletext);
    card.box.appendChild(card.titlebar);
    card.box.appendChild(card.content);
    card.root.appendChild(card.box);
    card.root.appendChild(card.sizer);

    if (args.buttons instanceof Array) {
        for (var i = 0; i < args.buttons.length; i++) {
            var btn = args.buttons[i];
            this.addButton(card, btn.html, btn.func);
        }
    }

    var par = this;
    this.addButton(card, 'X', function() {
        par.remove(card);
    });

    card.xAnim = new CardAnimatable(
        function()  { return card.x || 0; },
        function(v) { 
            card.x = v;
            card.root.style.transform = 'translateX(' + v + 'px)'; 
        }
    );
    card.wAnim = new CardAnimatable(
        function()  { return card.root.clientWidth; },
        function(v) {
            v = v + 'px';
            card.root.style.minWidth = v;
            card.root.style.maxWidth = v;
        }
    );
    card.oAnim = new CardAnimatable(
        function()  { 
            if (card.root.style.opacity == '')
                return 1.0;
            return parseFloat(card.root.style.opacity);
        },
        function(v) { card.root.style.opacity = v + ''; }
    );

    makeDraggable(card.titletext, card, this.titleDragStart, 
        this.titleDragCont, this.titleDragEnd, true);

    makeDraggable(card.sizer, card, this.sizerDragStart, this.sizerDragCont,
        this.sizerDragEnd, true);

    this.wrapper.appendChild(card.root); 

    if (this.insertAtLeft) {
        this.cards.splice(0, 0, card);
        if (this.cards.length > this.cardLimit)
            this.remove(this.cards[this.cards.length-1]);
    } else {
        this.cards.push(card);
        if (this.cards.length > this.cardLimit)
            this.remove(this.cards[0]);
        card.x = this.widthAnim.target;
    }

    card.root.style.opacity = '0';
    card.root.style.maxWidth = '0px';
    card.root.style.minWidth = '0px';

    var duration = this.addDuration;
    if (args.animate == false)
        duration = 0;

    card.oAnim.setTarget(1, duration);
    card.wAnim.setTarget(args.width, duration);
    card.wAnim.callback = args.onresize;
    this.updateOffsets(duration);

    this.scrollCardIntoView(card, duration);
    return card;
}

CardDeck.prototype.remove = function(card) {
    var idx = this.cards.indexOf(card);
    if (idx < 0)
        return;

    if (card == this.topCard)
        this.topCard = null;

    this.cards.splice(idx, 1);

    var par = this;
    card.oAnim.callback = function() {
        par.wrapper.removeChild(card.root);
        card.onclose && card.onclose();
        par.updateOffsets(par.springDuration);
    };
    card.wAnim.setTarget(0, this.removeDuration);
    card.oAnim.setTarget(0, this.removeDuration);

    this.updateOffsets(this.removeDuration);
};

CardDeck.prototype.sizerDragStart = function(card, e) {
    card.dragX = e.screenX;
    card.dragW = card.root.clientWidth;
    card.dragMargin = card.deck.wrapper.scrollWidth - 
        (card.deck.wrapper.scrollLeft + card.deck.wrapper.clientWidth);
};

CardDeck.prototype.sizerDragCont = function(card, e) {
    var dx = e.screenX - card.dragX;
    var w = Math.max(card.dragW + dx, card.deck.minWidth);
    card.wAnim.setTarget(w, 0); 
    card.deck.updateOffsets(0, (card.deck.wrapper.scrollLeft == 0));
};

CardDeck.prototype.sizerDragEnd = function(card, e) {
    var dx = card.root.scrollWidth - card.root.clientWidth;
    if (dx > 0)
        card.wAnim.setTarget(card.wAnim.target + dx, 
            card.deck.springDuration);

    card.deck.updateOffsets(card.deck.springDuration);
};

CardDeck.prototype.titleDragStart = function(card, e) {
    card.dragX = (card.deck.wrapper.scrollLeft + e.clientX) - card.x;
    card.deck.setTopCard(card);
    card.root.style.opacity = '0.5';
    card.dragging = true;
    card.deck.titleDragCard = card;
};

CardDeck.prototype.titleDragCont = function(card, e) {
    // Keep a facsimile of the event so we can reuse it upon scrolling
    // with scrollLeft.
    if (e != null)
        card.dragEvent = { clientX: e.clientX };
    else if (card.dragEvent != null)
        e = card.dragEvent;
    else
        return;

    // There is a bit of padding so technically this can't be compared 
    // directly to card.x values. But it's insignificant so I'll do it anyway.
    var scrollLeft  = card.deck.wrapper.scrollLeft;
    var clientWidth = card.deck.wrapper.clientWidth;
    var x = scrollLeft + e.clientX;
    card.xAnim.setTarget(x - card.dragX, 0);
   
    if (x < scrollLeft + 10)
        card.deck.scrollAnim.setSpeed(-card.deck.autoscrollSpeed, 0);
    else if (x > scrollLeft + clientWidth - 10)
        card.deck.scrollAnim.setSpeed(card.deck.autoscrollSpeed,
            card.deck.widthAnim.target - clientWidth);
    else
        card.deck.scrollAnim.stop();
    
    var cards = card.deck.cards;
    var myIndex = cards.indexOf(card);
    var idx = 0;
    var pos = 0;
    for (; idx < cards.length-1; idx++) {
        pos += cards[idx].wAnim.target;
        if (x < pos)
            break;
    }
    
    if (idx == myIndex)
        return;

    var frac = (x - cards[idx].xAnim.target) / cards[idx].wAnim.target;
    if ((frac > 0.5 && idx == myIndex-1) ||
        (frac < 0.5 && idx == myIndex+1))
        return;

    cards.splice(myIndex, 1);
    if (idx > myIndex)
        idx--;

    if (frac > 0.5)
        cards.splice(idx+1, 0, card);
    else
        cards.splice(idx, 0, card);

    card.deck.updateOffsets(card.deck.springDuration);
};

CardDeck.prototype.titleDragEnd = function(card, e) {
    card.deck.titleDragCard = null;
    card.deck.scrollAnim.stop();
    card.dragging = null;
    card.deck.updateOffsets(card.deck.springDuration);
    card.root.style.opacity = '1';
    card.deck.scrollCardIntoView(card);
};

