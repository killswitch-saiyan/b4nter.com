import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Supabase signaling functions for WebRTC
export const storeSignalingData = async (roomId: string, type: string, data: any) => {
  console.log(`🔄 [STORE] Attempting to store ${type} for room ${roomId}`, data);
  try {
    const { error } = await supabase
      .from('signaling')
      .insert({
        room_id: roomId,
        type: type,
        data: data
      });

    if (error) {
      console.error('❌ [STORE] Error storing signaling data:', error);
      throw error;
    } else {
      console.log(`✅ [STORE] Successfully stored ${type} for room ${roomId}`);
    }
  } catch (error) {
    console.error('💥 [STORE] Failed to store signaling data:', error);
    throw error;
  }
};

export const getSignalingData = async (roomId: string, type: string) => {
  try {
    const { data, error } = await supabase
      .from('signaling')
      .select('data')
      .eq('room_id', roomId)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error getting signaling data:', error);
      return null;
    }

    return data?.[0]?.data || null;
  } catch (error) {
    console.error('Failed to get signaling data:', error);
    return null;
  }
};

// Get ALL ICE candidates for a room
export const getAllIceCandidates = async (roomId: string) => {
  try {
    const { data, error } = await supabase
      .from('signaling')
      .select('data')
      .eq('room_id', roomId)
      .eq('type', 'ice_candidate')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error getting ICE candidates:', error);
      return [];
    }

    return data?.map(item => item.data) || [];
  } catch (error) {
    console.error('Failed to get ICE candidates:', error);
    return [];
  }
};

// Subscribe to signaling changes  
export const subscribeToSignaling = (roomId: string, callback: (type: string, data: any) => void) => {
  console.log(`📡 [SUB] Setting up real-time subscription for room: ${roomId}`);
  const subscription = supabase
    .channel(`signaling-${roomId}`)
    .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'signaling',
        filter: `room_id=eq.${roomId}`
      }, 
      (payload) => {
        console.log(`📨 [SUB] Received real-time signaling data:`, payload.new);
        callback(payload.new.type, payload.new.data);
      }
    )
    .subscribe((status) => {
      console.log(`📡 [SUB] Subscription status for room ${roomId}:`, status);
    });

  return subscription;
};

// Video Call Invitation functions using the same signaling table
export const sendCallInvite = async (roomId: string, callerName: string, targetUserId: string) => {
  console.log(`📞 Sending call invite from ${callerName} to ${targetUserId} for room ${roomId}`);
  return await storeSignalingData(roomId, 'call_invite', {
    caller_name: callerName,
    target_user_id: targetUserId,
    timestamp: Date.now()
  });
};

export const checkForCallInvite = async (roomId: string) => {
  console.log(`📞 Checking for call invite in room ${roomId}`);
  return await getSignalingData(roomId, 'call_invite');
};

export const respondToCallInvite = async (roomId: string, accepted: boolean, responderName: string) => {
  console.log(`📞 Responding to call invite in room ${roomId}: ${accepted ? 'accepted' : 'declined'}`);
  return await storeSignalingData(roomId, 'call_response', {
    accepted,
    responder_name: responderName,
    timestamp: Date.now()
  });
};

export const checkForCallResponse = async (roomId: string) => {
  console.log(`📞 Checking for call response in room ${roomId}`);
  return await getSignalingData(roomId, 'call_response');
};

// Subscribe to call invites and responses
export const subscribeToCallEvents = (roomId: string, callback: (type: string, data: any) => void) => {
  console.log(`📞 Setting up call event subscription for room: ${roomId}`);
  return subscribeToSignaling(roomId, (type, data) => {
    if (type === 'call_invite' || type === 'call_response') {
      callback(type, data);
    }
  });
};
