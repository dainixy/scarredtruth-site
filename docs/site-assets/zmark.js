/* zmark.js — drives the stitched-eight marks: the traveling dash on every
   .zinf, and the 15.08 infinity→heart morph on .zbig.
   These were CSS keyframes + SMIL <animate>. iOS Safari suspends SMIL when the
   mark is offscreen or the tab was backgrounded (often permanently), and stills
   the CSS draw under Reduce Motion — on iPhones the marks froze. rAF is the one
   clock iOS never takes away from a visible page; it pauses itself when the
   page is hidden, so no visibility bookkeeping is needed. */
(function(){
  if(!window.requestAnimationFrame||!window.performance)return;
  var marks=[].slice.call(document.querySelectorAll('svg.zinf'));
  if(!marks.length)return;

  /* the zdraw keyframe table (25 samples over the 4.6s loop), lerped */
  var DASH=[0,1.78,4.2,7.73,12.53,18.45,25,31.55,37.47,42.27,45.8,48.22,50,
            51.78,54.2,57.73,62.53,68.45,75,81.55,87.47,92.27,95.8,98.22,100];
  function dash(p){var x=p*24,i=Math.floor(x);if(i>=24)return -100;
    return -(DASH[i]+(DASH[i+1]-DASH[i])*(x-i))}

  var lines=[];
  marks.forEach(function(s){
    var l=s.querySelector('.zl');
    if(l){l.style.animation='none';lines.push(l)}
  });

  /* the morph: same 26 numbers (M + 4 cubics), mixed pointwise */
  var INF=[36.356,16,10.192,0,10.192,16,0,16,-10.19,0,-14.266,-16,-25.478,-16,
           -9.17,0,-9.17,16,0,16,11.212,0,15.288,-16,25.48,-16];
  var HRT=[24,41,-4,-5,-18,-12,-18,-21,0,-8,12,-12,18,-6,6,-6,18,-2,18,6,
           0,9,-14,16,-18,21];
  var big=document.querySelector('svg.zbig'),paths=[],hearts=[],
      HB=[[7,15],[41,15],[24,43]];
  if(big){
    paths=[].slice.call(big.querySelectorAll('.zt,.zl'));
    hearts=[].slice.call(big.querySelectorAll('.zm'));
  }
  function bez(x1,y1,x2,y2){
    function cx(t){return 3*t*(1-t)*(1-t)*x1+3*t*t*(1-t)*x2+t*t*t}
    function cy(t){return 3*t*(1-t)*(1-t)*y1+3*t*t*(1-t)*y2+t*t*t}
    return function(x){var lo=0,hi=1,t,i;
      for(i=0;i<22;i++){t=(lo+hi)/2;if(cx(t)<x)lo=t;else hi=t}
      return cy((lo+hi)/2)}
  }
  var easeM=bez(.4,0,.2,1),easeH=bez(.3,0,.2,1);
  function mix(k){var a='M'+(INF[0]+(HRT[0]-INF[0])*k)+' '+(INF[1]+(HRT[1]-INF[1])*k),i;
    for(i=2;i<26;i+=6){a+=' c';for(var j=i;j<i+6;j++)a+=(j>i?' ':'')+(INF[j]+(HRT[j]-INF[j])*k)}
    return a+' z'}

  /* SMIL timeline it replaces: 13.8s cycle — infinity to 66.67%, morph to heart
     by 73.19%, hold to 93.48%, morph back; hearts fade in 60→65.5%, fly to
     center while fading out 65.5→73.19% */
  var lastK=-1,t0=performance.now();
  function frame(now){
    var t=(now-t0)/1000,i;
    var od=dash((t/4.6)%1);
    for(i=0;i<lines.length;i++)lines[i].style.strokeDashoffset=od;
    if(big){
      var p=(t/13.8)%1,k;
      if(p<.6667)k=0;
      else if(p<.7319)k=easeM((p-.6667)/.0652);
      else if(p<.9348)k=1;
      else k=1-easeM((p-.9348)/.0652);
      if(k!==lastK){var d=mix(k);for(i=0;i<paths.length;i++)paths[i].setAttribute('d',d);lastK=k}
      for(i=0;i<hearts.length;i++){
        var o,hx=HB[i][0],hy=HB[i][1];
        if(p<.6)o=0;
        else if(p<.655)o=(p-.6)/.055;
        else if(p<.7319)o=1-(p-.655)/.0769;
        else o=0;
        if(o>0&&p>=.655){var m=easeH((p-.655)/.0769);hx+=(24-hx)*m;hy+=(26-hy)*m}
        hearts[i].style.opacity=o;
        if(o>0)hearts[i].setAttribute('transform','translate('+hx+','+hy+')');
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
