import { RoomView } from '../RoomView/roomView';
import { Sidebar } from '../sidebar/Sidebar';
import { ChatArea } from '../ui/ChatArea';
import { ViewListContainer } from './ViewListContainer';
import { ViewportHeightSync } from './ViewportHeightSync';

export function ChatLayout() {
  return (
    <div
      className="fixed inset-x-0 flex flex-row justify-center items-center overflow-hidden"
      style={{
        top: 'var(--app-offset-top, 0px)',
        height: 'var(--app-height, 100dvh)',
      }}
    >
      <ViewportHeightSync />
      <Sidebar />
      <ViewListContainer />
      <ChatArea />
      <RoomView />
    </div>
  );
}
