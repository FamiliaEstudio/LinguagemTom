#ifndef TOM_EDITOR_METRICS_H
#define TOM_EDITOR_METRICS_H
#ifdef _WIN32
#include <windows.h>
#include <psapi.h>
static void editor_memory_report(void){PROCESS_MEMORY_COUNTERS counters={0};counters.cb=sizeof(counters);if(K32GetProcessMemoryInfo(GetCurrentProcess(),&counters,sizeof(counters)))printf("peak-resident-bytes=%llu\n",(unsigned long long)counters.PeakWorkingSetSize);}
#else
#include <sys/resource.h>
static void editor_memory_report(void){struct rusage usage;if(!getrusage(RUSAGE_SELF,&usage))printf("peak-resident-bytes=%llu\n",(unsigned long long)usage.ru_maxrss*1024);}
#endif
#endif
