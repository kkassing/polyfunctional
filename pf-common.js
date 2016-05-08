///////////////////////////////////////////////////////////////////////////////
// Helper to make an element draggable, capturing mouse movements until the
// drag is finished.

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

