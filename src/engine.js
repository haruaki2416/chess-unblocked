const ENGINE_URL = 'https://cdn.jsdelivr.net/npm/stockfish@17.1.0/src/stockfish-17.1-lite-single.js';
export function getBotMove(fen, elo = 1600, style = 'balanced') {
 return new Promise((resolve,reject)=>{
  let worker, settled=false, timeout;
  const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timeout);try{worker?.terminate()}catch{}fn(value)};
  try {
   worker=new Worker(ENGINE_URL);
   const target=Math.max(400,Math.min(3200,Number(elo)||1600));
   const baseSkill=target<1320?Math.round(target/100):20;
   const styles={balanced:{skill:baseSkill},aggressive:{skill:Math.min(20,baseSkill+1)},defensive:{skill:Math.max(0,baseSkill-1)},positional:{skill:baseSkill},chaotic:{skill:Math.max(0,baseSkill-3)}};
   const profile=styles[style]||styles.balanced, skill=Math.max(0,Math.min(20,profile.skill));
   worker.onerror=()=>finish(reject,new Error('Stockfish worker failed to load.'));
   worker.onmessage=e=>{
    const line=String(e.data||'').trim();
    if(line==='uciok'){
     worker.postMessage('setoption name Threads value 1');worker.postMessage('setoption name Hash value 32');
     worker.postMessage('setoption name Skill Level value '+skill);worker.postMessage('setoption name UCI_LimitStrength value true');
     worker.postMessage('setoption name UCI_Elo value '+Math.max(1320,Math.min(3190,target)));
     worker.postMessage('isready');
    } else if(line==='readyok'){worker.postMessage('position fen '+fen);worker.postMessage('go movetime 900')}
    else if(line.startsWith('bestmove ')){const move=line.split(/\s+/)[1];if(!move||move==='(none)'||move==='0000')finish(reject,new Error('No legal move was returned.'));else finish(resolve,move)}
   };
   worker.postMessage('uci');timeout=setTimeout(()=>finish(reject,new Error('Stockfish took too long to respond.')),20000);
  }catch(error){finish(reject,error)}
 });
}
