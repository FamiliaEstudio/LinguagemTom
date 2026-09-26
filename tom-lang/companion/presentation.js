'use strict';
// One input in flight; pointer motion/resize are coalesced before entering the native queue.
class Presentation {
  constructor(owner){this.owner=owner;this.visible=false;this.sequence=0;this.inputSequence=0;this.queue=[];this.state=null;}
  receive(packet){
    if(!['viewState','inputAck'].includes(packet.kind))return false;
    if(packet.v!==1)throw Error('Versão visual incompatível.');
    const o=this.owner,id=o.id||o.session;
    if(packet.session!==id)return true;
    if(packet.kind==='inputAck'){
      if(packet.input===this.inflight){clearTimeout(this.timer);this.inflight=null;this.flush();}
      return true;
    }
    if(!Number.isSafeInteger(packet.sequence)||packet.sequence<=0)throw Error('Sequência visual inválida.');
    o.send({kind:'viewAck',sequence:packet.sequence});
    if(packet.sequence<=this.sequence||packet.revision!==o.revision)return true;
    this.sequence=packet.sequence;this.state=packet;o.emit('view',packet);return true;
  }
  setVisible(visible){this.visible=!!visible;if(this.owner.ready)this.owner.send({kind:'visibility',visible:this.visible});}
  ready(){if(!this.owner.headless)return;this.setVisible(this.visible);this.flush();}
  input(value){
    if(!this.owner.ready||this.owner.disposed)throw Error('Reabra o Companion para conectar os controles.');
    if(this.queue.length>=64)throw Error('Aguarde a conclusão das ações anteriores.');
    const last=this.queue.at(-1);
    if([5,10].includes(value.type)&&last?.type===value.type)this.queue[this.queue.length-1]=value;
    else this.queue.push(value);
    this.flush();
  }
  flush(){
    if(this.inflight||!this.owner.ready||this.owner.disposed||!this.queue.length)return;
    const value=this.queue.shift();this.inflight=++this.inputSequence;
    this.owner.send({kind:'input',...value,input:this.inflight});
    this.timer=setTimeout(()=>{this.queue=[];this.inflight=null;this.owner.emit('failure',Error('O painel deixou de responder. Reabra o Companion.'));},5000);
  }
  dispose(){clearTimeout(this.timer);this.queue=[];this.inflight=null;}
}
module.exports={Presentation};
