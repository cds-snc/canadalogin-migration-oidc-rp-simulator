const randomString = function(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for(var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function getCurrentLanguage() {
    const htmlLang = document.documentElement.getAttribute('lang');
    if (htmlLang && htmlLang.toLowerCase().startsWith('fr')) return 'fr';
    if (htmlLang && htmlLang.toLowerCase().startsWith('en')) return 'en';

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const pathLanguage = pathParts.find(part => part === 'fr' || part === 'en');
    return pathLanguage || 'en';
}

function getCurrentLocale() {
    return getCurrentLanguage() === 'fr' ? 'fr-CA' : 'en-CA';
}

function setValueIfPresent(id, value) {
    const element = document.getElementById(id);
    if (element && value) element.value = value;
}

function setCheckedIfPresent(id, value, fallback) {
    const element = document.getElementById(id);
    if (!element) return;

    if (value) {
        element.checked = (value === 'true');
        return;
    }

    if (fallback !== undefined) {
        element.checked = fallback;
        storeVal(id, String(fallback));
    }
}

function setOptionsValues() {	
    // Check localStorage expiration: clear the local storage every x amount of time 
    checkExpiration ();

    const max_age = localStorage.getItem('max_age');
    const acr_values = localStorage.getItem('acr_values');
    const redirect_uri = localStorage.getItem('redirect_uri');
    const scope = localStorage.getItem('scope');
    const prompt = localStorage.getItem('prompt');
    const nonce = localStorage.getItem('nonce');
    const login_hint = localStorage.getItem('login_hint'); 
    const id_token_hint = localStorage.getItem('id_token_hint');
    const ui_locales = localStorage.getItem('ui_locales');

    setValueIfPresent('max_age', max_age);
    setValueIfPresent('acr_values', acr_values);
    setValueIfPresent('redirect_uri', redirect_uri);
    setValueIfPresent('scope', scope);
    setValueIfPresent('prompt', prompt);
    setCheckedIfPresent('nonce', nonce);
    setCheckedIfPresent('login_hint', login_hint);
    if (!id_token_hint) storeVal('id_token_hint', 'true');
    setCheckedIfPresent('id_token_hint', id_token_hint || 'true');
    setCheckedIfPresent('ui_locales', ui_locales);

    // store lang_locale: for login page redirection purpose (to the right language)
    localStorage.setItem('lang_locale', getCurrentLocale());
}

function storeVal(key, val) {	
    localStorage.setItem(key, val);
}

function clearValues() {	
    localStorage.clear();
}

function checkExpiration () { 
    var hours = 3; // to clear the localStorage after 3 hours
    var now = new Date().getTime();
    var setupTime = localStorage.getItem('setupTime');
    if ( setupTime == null ) {
        localStorage.setItem('setupTime', now)
    } else {
        if( now-setupTime > hours*60*60*1000 ) {
            localStorage.clear()
            localStorage.setItem('setupTime', now);
        }
    }
}

function submitWithQueryString(obj) {		     
    const cspUrl = new URL(obj.href);
    const scope = document.getElementById('scope');
    const prompt = document.getElementById('prompt');
    const max_age = document.getElementById('max_age');
    const acr_values = document.getElementById('acr_values');
    const redirect_uri = document.getElementById('redirect_uri');
    const ui_locales = document.getElementById('ui_locales');
    const nonce = document.getElementById('nonce');
    const login_hint = document.getElementById('login_hint');

    if ( scope ) cspUrl.searchParams.set('scope', scope.options[scope.selectedIndex].text);
    if ( max_age && max_age.value ) cspUrl.searchParams.set('max_age', max_age.value);
    if ( prompt && prompt.options[prompt.selectedIndex].value != 'empty' ) cspUrl.searchParams.set('prompt', prompt.options[prompt.selectedIndex].text);
    if ( !ui_locales || ui_locales.checked ) cspUrl.searchParams.set('ui_locales', getCurrentLocale());
    if ( nonce && nonce.checked ) cspUrl.searchParams.set('nonce', randomString(32));
    if ( login_hint && login_hint.checked ) cspUrl.searchParams.set('login_hint', randomString(32));
    if ( acr_values && acr_values.value != '' ) cspUrl.searchParams.set('acr_values', acr_values.value);
    if ( redirect_uri && redirect_uri.value != '' ) cspUrl.searchParams.set('redirect_uri', redirect_uri.value);

    obj.href = cspUrl;
}
