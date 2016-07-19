#!/usr/bin/perl

use Astro::Time;
use JSON;
use strict;

# This script simply generates JSON files for each time integration
# of a particular named source, using uvspec.

my $sourcename = $ARGV[0];
#my $epname = $ARGV[1];

my $json = JSON->new;

print "1. Find all directories for the source $sourcename.\n";
my @dirs = &findsources($sourcename);

# Make our temporary directory.
my $tmpdir = "tmp_htr";
if (-d $tmpdir) {
    system "rm -rf $tmpdir";
}
system "mkdir $tmpdir";

my %alldata;

print "2. Making spectra...\n";
for (my $i = 0; $i <= $#dirs; $i++) {
    print "  ".($i + 1)." / ".($#dirs + 1)."\n";
    #print $dirs[$i]."\n";
    my $logname = &makespectrum($dirs[$i], $tmpdir, $i);
    my %nd = &readlog($logname);
    if (%nd) {
	foreach my $k (keys %nd) {
	    if (!exists $alldata{$k}) {
		$alldata{$k} = $nd{$k};
	    } else {
		push @{$alldata{$k}->{'f'}}, @{$nd{$k}->{'f'}};
		push @{$alldata{$k}->{'a'}}, @{$nd{$k}->{'a'}};
	    }
	}
    }
}

print "3. Assembling JSON...\n";

my $jsondata = { 'source' => $sourcename, 'spectra' => [] };

foreach my $k (keys %alldata) {
    my $t = &mir2mjd($k);
    my $r = { 'time' => $k, 'mjd' => $t, 'data' => [] };
    for (my $i = 0; $i <= $#{$alldata{$k}->{'f'}}; $i++) {
	push @{$r->{'data'}}, [ $alldata{$k}->{'f'}->[$i],
				$alldata{$k}->{'a'}->[$i] ];
    }
    push @{$jsondata->{'spectra'}}, $r;
}

print "4. Outputting JSON...\n";
open(O, ">".$sourcename."_htr.json");
print O to_json $jsondata;
close(O);

sub mir2mjd {
    my $t = shift;

    my @months = ( 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
	'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC' );

    if ($t =~ /^(..)(...)(..)\:(..)\:(..)\:(....)$/) {
        my $mjd = cal2mjd($3, &arrn(\@months, $2) + 1, 2000 + $1,
                          &hms2time($4, $5, $6));
        return $mjd;
    } else {
        return 0;
    }

}

sub arrn {
    my $a = shift;
    my $b = shift;

    for (my $j=0; $j<=$#{$a}; $j++) {
        if ($a->[$j] eq $b) {
           return $j;
        }
    }
    return -1;
}

sub readlog {
    my $l = shift;

    if (!-e $l) {
	return undef;
    }

    my %data;
    open(L, $l);
    my $k = "";
    while(<L>) {
	chomp;
	my $line = $_;
	if ($line =~ /^.......\:..\:..\:....$/) {
	    # A new date.
	    $k = $line;
	    $data{$k} = { 'f' => [], 'a' => [] };
	} elsif($k ne "") {
	    my @els = split(/\s+/, $line);
	    push @{$data{$k}->{'f'}}, $els[1];
	    push @{$data{$k}->{'a'}}, $els[2];
	}
    }
    close(L);

    return %data;
}

sub makespectrum {
    my $d = shift;
    my $o = shift;
    my $n = shift;

    my $fname = $o."/".$n.".log";
    my $uvspec_cmd = "uvspec vis=".$d." stokes=i axis=freq,amp ".
	"options=nobase,avall,timelog log=".$fname;
    system $uvspec_cmd;

    return $fname;
    
}

sub findsources {
    my $s = shift;
    my @dirs = map { chomp(my $a = $_); $a =~ s/^\.\///; $a =~ s/\/visdata*$//; $a } `find . -path "*/v3_redo/*/$s.*/visdata"`;
    
    my @sdirs = sort @dirs;

    for (my $i = 0; $i < $#sdirs; $i++) {
	if ($sdirs[$i] eq $sdirs[$i + 1]) {
	    splice @sdirs, ($i + 1), 1;
	    $i--;
	}
    }

    return @sdirs;
}
